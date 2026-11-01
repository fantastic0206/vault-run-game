import { createHash } from "node:crypto";
import { PROTOCOL, type Input, type PlayerCommand, type World } from "../src/game/types.js";
import { sanitizeCommands, sanitizeInput, validWorld } from "../src/game/validate.js";
import { authenticate, publicRoom, readRoom } from "./rooms.js";
import { ApiError, checkpoint, frameKey, getStorage, type Storage } from "./storage.js";

export interface SavedInput { sender: string; stream: string; input: Input; commands?: PlayerCommand[]; at: number; gameId: string }
export const inputKey = (code: string, gameId: string, id: string) => `vb:input:${code}:${gameId}:${id}`;
export const validStream = (stream: unknown): stream is string => typeof stream === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(stream);

/** A delayed request must never overwrite a newer frame or rewind a recovering host. */
export async function persistFrame(store: Storage, code: string, gameId: string, world: World) {
  const key = frameKey(code, gameId);
  for (let n = 0; n < 5; n++) {
    const before = await store.get(key);
    if (before) {
      const previous = JSON.parse(before) as World;
      if (previous.version === world.version && previous.tick > world.tick) return false;
      if (previous.version === world.version && previous.tick === world.tick && previous.status !== "playing") return false;
    }
    if (await store.cas(key, before, JSON.stringify(world), 3600)) return true;
  }
  return false;
}
export async function persistInput(store: Storage, code: string, value: SavedInput) {
  const key = inputKey(code, value.gameId, value.sender);
  for (let n = 0; n < 5; n++) {
    const before = await store.get(key);
    if (before) {
      const previous = JSON.parse(before) as SavedInput;
      if (previous.stream === value.stream && previous.input.seq >= value.input.seq) return;
      if (previous.at > value.at) return;
    }
    if (await store.cas(key, before, JSON.stringify(value), 30)) return;
  }
}

/** Durable same-origin backup. It works without WebSocket upgrades or pub/sub delivery. */
export async function syncRequest(body: unknown, token: string, store = getStorage(), now = Date.now()) {
  if (!body || typeof body !== "object") throw new ApiError("Invalid crew update.");
  const b = body as Record<string, unknown>;
  if (b.protocol !== PROTOCOL) throw new ApiError("The game has updated. Refresh every page and create a fresh room.", 409);
  const room = await readRoom(store, String(b.code)), self = authenticate(room, token);
  const rate = "sync:" + createHash("sha256").update(token).digest("hex").slice(0, 24);
  if (!await store.allow(rate, 480)) throw new ApiError("Connection recovery is busy. Retrying shortly.", 429);
  const ids = room.players.map(p => p.id);
  if (b.gameId === room.gameId && room.phase !== "lobby") {
    if (b.world !== undefined) {
      if (self.id !== room.hostId) throw new ApiError("Only the squad lead can publish mission state.", 403);
      if (!validWorld(b.world, ids) || (b.world.difficulty !== publicRoom(room).difficulty || b.world.bots !== publicRoom(room).bots)) throw new ApiError("Invalid mission snapshot.");
      await persistFrame(store, room.code, room.gameId, b.world);
    }
    if (b.input !== undefined && self.id !== room.hostId) {
      const input = sanitizeInput(b.input), commands = b.commands === undefined ? undefined : sanitizeCommands(b.commands);
      if (!input || commands === null || !validStream(b.stream)) throw new ApiError("Invalid control update.");
      await persistInput(store, room.code, { sender: self.id, stream: b.stream, input, commands: commands ?? undefined, at: now, gameId: room.gameId });
    }
  }
  const cached = room.phase === "lobby" ? null : await checkpoint(store, room.code, room.gameId);
  const world = validWorld(cached, ids) ? cached : null;
  const inputs: SavedInput[] = [];
  if (self.id === room.hostId && room.phase === "playing") {
    const values = await Promise.all(room.players.filter(p => !p.left && p.id !== self.id).map(p => store.get(inputKey(room.code, room.gameId, p.id))));
    for (const raw of values) if (raw) {
      const value = JSON.parse(raw) as SavedInput;
      if (now - value.at <= 1200 && value.gameId === room.gameId && validStream(value.stream) && sanitizeInput(value.input)) inputs.push(value);
    }
  }
  return { protocol: PROTOCOL, room: publicRoom(room, self.id, now), world, inputs };
}
