import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Room } from "../src/game/types.js";
import {
  ApiError,
  getStorage,
  liveChannel,
  roomKey,
  type Storage,
} from "./storage.js";

export interface PrivateSeat {
  id: string;
  name: string;
  color: number;
  hash: string;
  seen: number;
  live: boolean;
  left: boolean;
}
export interface PrivateRoom {
  code: string;
  version: number;
  gameId: string;
  hostId: string;
  phase: Room["phase"];
  players: PrivateSeat[];
  result: Room["result"];
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function name(value: unknown) {
  if (typeof value !== "string") throw new ApiError("Enter a codename.");
  const n = value.replace(/[\p{C}<>]/gu, "").trim();
  if (!n || n.length > 18)
    throw new ApiError("Use 1–18 characters for your codename.");
  return n;
}
function code() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(6), (n) => alphabet[n % alphabet.length]).join(
    "",
  );
}
export function authenticate(r: PrivateRoom, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(
      "Your crew seat could not be verified. Join again.",
      401,
    );
  const h = hash(token),
    p = r.players.find(
      (p) => !p.left && timingSafeEqual(Buffer.from(p.hash), Buffer.from(h)),
    );
  if (!p)
    throw new ApiError("This seat has left the crew. Join a fresh lobby.", 401);
  return p;
}
export function publicRoom(
  r: PrivateRoom,
  selfId = "",
  now = Date.now(),
): Room {
  return {
    code: r.code,
    version: r.version,
    gameId: r.gameId,
    hostId: r.hostId,
    phase: r.phase,
    result: r.result,
    selfId,
    players: r.players
      .filter((p) => !p.left)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        online: now - p.seen < 18000 && (r.phase !== "playing" || p.live),
      })),
  };
}
export async function readRoom(store: Storage, code: string) {
  if (!/^[A-Z2-9]{6}$/.test(code))
    throw new ApiError("Enter a 6-character room code.");
  const raw = await store.get(roomKey(code));
  if (!raw)
    throw new ApiError("Room not found or expired. Check the code.", 404);
  return JSON.parse(raw) as PrivateRoom;
}
async function update(
  store: Storage,
  code: string,
  action: (r: PrivateRoom) => void,
) {
  if (!/^[A-Z2-9]{6}$/.test(code))
    throw new ApiError("Enter a 6-character room code.");
  for (let i = 0; i < 10; i++) {
    const before = await store.get(roomKey(code));
    if (!before)
      throw new ApiError("Room not found or expired. Create a new one.", 404);
    const r = JSON.parse(before) as PrivateRoom;
    action(r);
    r.version++;
    if (await store.cas(roomKey(code), before, JSON.stringify(r), 21600)) {
      await store.publish(
        liveChannel(code),
        JSON.stringify({ type: "room", room: publicRoom(r) }),
      );
      return r;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));
  }
  throw new ApiError("The crew is busy. Try again.", 409);
}
export async function roomRequest(
  body: unknown,
  token: string,
  ip: string,
  store = getStorage(),
  now = Date.now(),
) {
  if (!body || typeof body !== "object")
    throw new ApiError("Invalid room request.");
  const b = body as Record<string, unknown>,
    type = String(b.type);
  const authenticated = !["create", "join"].includes(type) && !!token;
  if (
    !(await store.allow(
      hash(authenticated ? token : ip).slice(0, 24),
      authenticated ? 150 : 30,
    ))
  )
    throw new ApiError("Too many room requests. Try again in a minute.", 429);
  if (type === "create") {
    const token = randomBytes(32).toString("hex"),
      id = randomUUID(),
      n = name(b.name);
    for (let i = 0; i < 6; i++) {
      const c = code(),
        r: PrivateRoom = {
          code: c,
          version: 1,
          gameId: randomUUID(),
          hostId: id,
          phase: "lobby",
          players: [
            {
              id,
              name: n,
              color: 0,
              hash: hash(token),
              seen: now,
              live: false,
              left: false,
            },
          ],
          result: null,
        };
      if (await store.cas(roomKey(c), null, JSON.stringify(r), 21600))
        return { room: publicRoom(r, id, now), token, id };
    }
    throw new ApiError("Could not create a room. Try again.", 503);
  }
  const c = String(b.code ?? "");
  if (type === "join") {
    const token = randomBytes(32).toString("hex"),
      id = randomUUID(),
      n = name(b.name);
    const r = await update(store, c, (r) => {
      if (r.phase !== "lobby")
        throw new ApiError(
          "This crew is on a mission. Join when the host opens a new lobby.",
          409,
        );
      r.players = r.players.filter((p) => !p.left && now - p.seen < 18000);
      if (r.players.length >= 4)
        throw new ApiError(
          "This crew is full. Up to 4 operatives can join.",
          409,
        );
      if (r.players.some((p) => p.name.toLowerCase() === n.toLowerCase()))
        throw new ApiError("That codename is already in this crew.", 409);
      const color = [0, 1, 2, 3].find(
        (color) => !r.players.some((p) => p.color === color),
      )!;
      r.players.push({
        id,
        name: n,
        color,
        hash: hash(token),
        seen: now,
        live: false,
        left: false,
      });
      if (!r.players.some((p) => p.id === r.hostId)) r.hostId = id;
    });
    return { room: publicRoom(r, id, now), token, id };
  }
  let selfId = "";
  const r = await update(store, c, (r) => {
    const p = authenticate(r, token);
    selfId = p.id;
    if (r.phase !== "playing" || b.live === true) {
      p.seen = now;
      p.live = b.live === true;
    }
    const host = r.players.find((q) => q.id === r.hostId && !q.left);
    if (!host || now - host.seen > 18000) {
      const next = r.players.find((q) => !q.left && now - q.seen < 18000);
      if (next) r.hostId = next.id;
      if (r.phase === "playing") {
        r.phase = "finished";
        r.result = "aborted";
      }
    }
    if (type === "sync") return;
    if (type === "leave") {
      p.left = true;
      p.live = false;
      if (p.id === r.hostId) {
        const next = r.players.find((q) => !q.left);
        r.hostId = next?.id ?? "";
        if (r.phase === "playing") {
          r.phase = "finished";
          r.result = "aborted";
        }
      }
      return;
    }
    if (p.id !== r.hostId)
      throw new ApiError("Only the host can control the mission.", 403);
    if (type === "start") {
      if (r.phase !== "lobby")
        throw new ApiError("The mission has already started.", 409);
      r.players = r.players.filter((q) => !q.left && now - q.seen < 18000);
      if (!r.players.length)
        throw new ApiError("The crew is not connected.", 409);
      if (r.players.some((q) => !q.live))
        throw new ApiError(
          "Wait for every operative’s live connection before starting.",
          409,
        );
      r.phase = "playing";
      r.gameId = randomUUID();
      r.result = null;
      return;
    }
    if (type === "finish") {
      if (b.gameId !== r.gameId || r.phase !== "playing")
        throw new ApiError("This mission has moved on.", 409);
      if (!["won", "lost"].includes(String(b.result)))
        throw new ApiError("Invalid mission result.");
      r.phase = "finished";
      r.result = b.result as "won" | "lost";
      return;
    }
    if (type === "rematch") {
      if (r.phase !== "finished")
        throw new ApiError("Finish this raid first.", 409);
      r.players = r.players.filter((q) => !q.left && now - q.seen < 18000);
      r.phase = "lobby";
      r.result = null;
      return;
    }
    throw new ApiError("Unknown room action.");
  });
  return { room: publicRoom(r, selfId, now) };
}
