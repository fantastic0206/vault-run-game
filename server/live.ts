import { type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { sanitizeInput, validWorld } from "../src/game/validate.js";
import { PROTOCOL } from "../src/game/types.js";
import { persistFrame, persistInput, validStream } from "./sync.js";
import {
  authenticate,
  publicRoom,
  readRoom,
  type PrivateRoom,
} from "./rooms.js";
import {
  ApiError,
  checkpoint,
  frameKey,
  getStorage,
  liveChannel,
  type Storage,
} from "./storage.js";

interface Connection {
  ws: WebSocket;
  code: string;
  id: string;
  token: string;
  room: PrivateRoom;
  unsubscribe: () => void;
  frames: number;
  window: number;
  checkpoint: number;
  refresh: number;
  stream: string;
  inputCheckpoint: number;
}
export function attachLive(server: Server, provided?: Storage) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 100_000,
    perMessageDeflate: false,
  });
  const connections = new Set<Connection>();
  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url ?? "/", "http://localhost").pathname !== "/api/live")
      return;
    try {
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      ) {
        socket.destroy();
        return;
      }
    } catch {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  wss.on("connection", (ws) => {
    let connection: Connection | undefined,
      authenticating = false,
      ready = false;
    const timeout = setTimeout(() => {
      if (!connection) ws.close(4401, "Authenticate first.");
    }, 6000);
    const send = (value: unknown) => {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1_000_000)
        ws.send(JSON.stringify(value));
    };
    ws.on("message", async (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        const store = provided ?? getStorage();
        if (!connection) {
          if (authenticating || message.type !== "hello") return;
          if (message.protocol !== PROTOCOL) {
            send({ type: "error", terminal: true, error: "The game has updated. Refresh every player's page and create a fresh room." });
            ws.close(4409, "Version mismatch");
            return;
          }
          authenticating = true;
          const room = await readRoom(store, String(message.code)),
            seat = authenticate(room, String(message.token));
          if (ws.readyState !== WebSocket.OPEN) return;
          connection = {
            ws,
            code: room.code,
            id: seat.id,
            token: String(message.token),
            room,
            unsubscribe: () => {},
            frames: 0,
            window: Date.now(),
            checkpoint: 0,
            refresh: Date.now(),
            stream: validStream(message.stream) ? message.stream : randomUUID(),
            inputCheckpoint: 0,
          };
          const c = connection;
          c.unsubscribe = await store.subscribe(
            liveChannel(room.code),
            (data) => {
              try {
                const packet = JSON.parse(data);
                if (packet.type === "room") {
                  c.room = {
                    ...c.room,
                    ...packet.room,
                    players: c.room.players,
                  };
                  // Token hashes stay private; fetch full membership on the next frame/control refresh.
                  c.refresh = 0;
                  if (ready) send({ ...packet, room: { ...packet.room, selfId: c.id } });
                } else if (packet.type === "input" && packet.target === c.id)
                  { if (ready) send(packet); }
                else if (
                  ready &&
                  packet.type === "world" &&
                  packet.sender !== c.id &&
                  packet.gameId === c.room.gameId
                )
                  send(packet);
              } catch {
                /* Ignore malformed relay data. */
              }
            },
          );
          if (ws.readyState !== WebSocket.OPEN) { c.unsubscribe(); return; }
          connections.add(c);
          clearTimeout(timeout);
          // A start/join can race the async Redis subscription. Bootstrap from current membership.
          const latest = await readRoom(store, room.code);
          authenticate(latest, c.token);
          if (latest.version >= c.room.version) c.room = latest;
          const cached = await checkpoint(store, room.code, c.room.gameId);
          const world = validWorld(cached, c.room.players.map((p) => p.id)) ? cached : null;
          if (ws.readyState !== WebSocket.OPEN) { c.unsubscribe(); connections.delete(c); return; }
          ready = true;
          send({ type: "hello", protocol: PROTOCOL, room: publicRoom(c.room, seat.id), world });
          return;
        }
        const c = connection,
          now = Date.now();
        if (now - c.window >= 1000) {
          c.window = now;
          c.frames = 0;
        }
        if (++c.frames > 50) {
          ws.close(4429, "Frame rate exceeded.");
          return;
        }
        if (message.type === "ping") { send({ type: "pong" }); return; }
        if (now - c.refresh > 2500) {
          c.room = await readRoom(store, c.code);
          authenticate(c.room, c.token);
          c.refresh = now;
        }
        if (message.gameId !== c.room.gameId || c.room.phase === "lobby")
          return;
        if (message.type === "input") {
          const input = sanitizeInput(message.input);
          if (!input) return;
          if (now - c.inputCheckpoint > 180) {
            c.inputCheckpoint = now;
            await persistInput(store, c.code, { sender: c.id, stream: c.stream, input, at: now, gameId: c.room.gameId });
          }
          await store.publish(
            liveChannel(c.code),
            JSON.stringify({
              type: "input",
              sender: c.id,
              stream: c.stream,
              target: c.room.hostId,
              input,
              gameId: c.room.gameId,
            }),
          );
        } else if (message.type === "world") {
          if (
            c.id !== c.room.hostId ||
            !validWorld(
              message.world,
              c.room.players.map((p) => p.id),
            )
          )
            return;
          // Persist before publishing: a broken subscriber must not freeze the backup connection.
          if (now - c.checkpoint > 250) {
            c.checkpoint = now;
            await persistFrame(store, c.code, c.room.gameId, message.world);
          }
          await store.publish(
            liveChannel(c.code),
            JSON.stringify({
              type: "world",
              sender: c.id,
              gameId: c.room.gameId,
              world: message.world,
            }),
          );
        }
      } catch (error) {
        send({
          type: "error",
          terminal: error instanceof ApiError && [401, 404].includes(error.status),
          error:
            error instanceof ApiError
              ? error.message
              : error instanceof SyntaxError
                ? "Invalid live packet."
                : "The live relay is temporarily unavailable. Retrying may help.",
        });
        if (!ready) ws.close(error instanceof ApiError && [401, 404].includes(error.status) ? 4401 : 1013, "Live relay unavailable");
      }
    });
    ws.on("close", () => {
      clearTimeout(timeout);
      if (connection) {
        connection.unsubscribe();
        connections.delete(connection);
      }
    });
    ws.on("error", () => {});
  });
  // Browser WebSocket implementations answer protocol pings automatically.
  const rotate = setInterval(() => {
    for (const c of connections) {
      if (c.ws.readyState === WebSocket.OPEN) c.ws.ping();
    }
  }, 15000);
  rotate.unref();
  return {
    wss,
    close: () => {
      clearInterval(rotate);
      for (const c of connections) c.ws.close();
      wss.close();
    },
  };
}
