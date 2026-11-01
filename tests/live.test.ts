import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { attachLive } from "../server/live.ts";
import { MemoryStorage, frameKey } from "../server/storage.ts";
import { roomRequest } from "../server/rooms.ts";
import { createWorld, frame, stepWorld } from "../src/game/simulation.ts";
import { EMPTY_INPUT } from "../src/game/types.ts";

function next(
  ws: WebSocket,
  predicate: (message: any) => boolean,
  ms = 2500,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", handler);
      reject(new Error("Timed out waiting for a WebSocket packet."));
    }, ms);
    const handler = (data: unknown) => {
      const packet = JSON.parse(String(data));
      if (predicate(packet)) {
        clearTimeout(timeout);
        ws.off("message", handler);
        resolve(packet);
      }
    };
    ws.on("message", handler);
  });
}
async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `ws://127.0.0.1:${(server.address() as { port: number }).port}/api/live`;
}
async function connect(
  url: string,
  seat: { room: { code: string }; token?: string },
) {
  const ws = new WebSocket(url);
  await once(ws, "open");
  const hello = next(ws, (m) => m.type === "hello");
  ws.send(
    JSON.stringify({ type: "hello", code: seat.room.code, token: seat.token }),
  );
  const data = await hello;
  return { ws, data };
}

test("two independent WebSocket servers share a room, relay input, authenticate authority, and restore a checkpoint", async () => {
  const store = new MemoryStorage(),
    a = createServer(),
    b = createServer(),
    liveA = attachLive(a, store),
    liveB = attachLive(b, store),
    sockets: WebSocket[] = [];
  try {
    const [urlA, urlB] = await Promise.all([listen(a), listen(b)]);
    const host = await roomRequest(
      { type: "create", name: "Rook" },
      "",
      "host",
      store,
    );
    const guest = await roomRequest(
      { type: "join", code: host.room.code, name: "Ghost" },
      "",
      "guest",
      store,
    );
    const h = await connect(urlA, host),
      g = await connect(urlB, guest);
    sockets.push(h.ws, g.ws);
    assert.equal(h.data.room.selfId, host.id);
    assert.equal(g.data.room.selfId, guest.id);
    assert.ok(!JSON.stringify(g.data).includes(host.token!));
    for (const seat of [host, guest])
      await roomRequest(
        { type: "sync", code: host.room.code, live: true },
        seat.token!,
        "test",
        store,
      );
    const hostStarted = next(
      h.ws,
      (m) => m.type === "room" && m.room.phase === "playing",
    );
    const guestStarted = next(
      g.ws,
      (m) => m.type === "room" && m.room.phase === "playing",
    );
    const started = await roomRequest(
      { type: "start", code: host.room.code, live: true },
      host.token!,
      "test",
      store,
    );
    await Promise.all([hostStarted, guestStarted]);
    const gameId = started.room.gameId;
    const input = { ...EMPTY_INPUT, mx: 1, shoot: true, seq: 3 };
    const relay = next(h.ws, (m) => m.type === "input");
    g.ws.send(JSON.stringify({ type: "input", gameId, input }));
    const delivered = await relay;
    assert.equal(delivered.sender, guest.id);
    assert.equal(delivered.input.mx, 1);
    assert.equal(delivered.input.shoot, true);
    const world = createWorld(started.room.players);
    stepWorld(world, { [host.id!]: { ...EMPTY_INPUT, mx: 1 } }, 0.05);
    const guestFrame = next(g.ws, (m) => m.type === "world");
    h.ws.send(JSON.stringify({ type: "world", gameId, world: frame(world) }));
    const state = await guestFrame;
    assert.equal(state.world.players[0].x, world.players[0].x);
    assert.equal(state.world.tick, 1);
    // Only the host can publish simulation frames, even through a different Function instance.
    const forged = { ...frame(world), tick: 999 };
    const received: any[] = [];
    h.ws.on("message", (data) => received.push(JSON.parse(String(data))));
    g.ws.send(JSON.stringify({ type: "world", gameId, world: forged }));
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.ok(!received.some((m) => m.type === "world"));
    const saved = await store.get(frameKey(host.room.code, gameId));
    assert.ok(saved);
    assert.equal(JSON.parse(saved!).tick, 1);
    h.ws.close();
    await once(h.ws, "close");
    const restored = await connect(urlB, host);
    sockets.push(restored.ws);
    assert.equal(restored.data.world.tick, 1);
    assert.equal(restored.data.room.hostId, host.id);
    const endedPacket = next(
      g.ws,
      (m) => m.type === "room" && m.room.phase === "finished",
    );
    await roomRequest(
      {
        type: "finish",
        code: host.room.code,
        live: true,
        gameId,
        result: "won",
      },
      host.token!,
      "test",
      store,
    );
    assert.equal((await endedPacket).room.result, "won");
  } finally {
    for (const ws of sockets) ws.terminate();
    liveA.close();
    liveB.close();
    await Promise.all([
      new Promise<void>((resolve) => a.close(() => resolve())),
      new Promise<void>((resolve) => b.close(() => resolve())),
    ]);
  }
});

test("WebSocket seats reject wrong credentials and malformed JSON without leaking storage details", async () => {
  const store = new MemoryStorage(),
    server = createServer(),
    live = attachLive(server, store);
  let bad: WebSocket | undefined;
  try {
    const url = await listen(server);
    const host = await roomRequest(
      { type: "create", name: "Host" },
      "",
      "ip",
      store,
    );
    bad = new WebSocket(url);
    await once(bad, "open");
    const denied = next(bad, (m) => m.type === "error");
    bad.send(
      JSON.stringify({
        type: "hello",
        code: host.room.code,
        token: "0".repeat(64),
      }),
    );
    const packet = await denied;
    assert.ok(packet.error.includes("seat"));
    assert.ok(!packet.error.includes("Redis"));
    await once(bad, "close");
    const authenticated = await connect(url, host);
    bad = authenticated.ws;
    const malformed = next(bad, (m) => m.type === "error");
    bad.send("{broken");
    assert.equal((await malformed).error, "Invalid live packet.");
  } finally {
    bad?.terminate();
    live.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
