import { createHash } from "node:crypto";
import {
  addPlayer,
  advance,
  applyAction,
  authenticate,
  GameError,
  newPlayer,
  newRoom,
  roomCode,
  snapshot,
  type Room,
} from "./engine.js";
import { getStore, updateRoom, type Store } from "./store.js";

export async function gameRequest(
  body: unknown,
  token: string,
  ip: string,
  store: Store = getStore(),
  now = Date.now(),
) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new GameError("Invalid request.");
  const data = body as Record<string, unknown>;
  const seatAction =
    data.type !== "create" &&
    data.type !== "join" &&
    /^[a-f0-9]{64}$/.test(token);
  const rateId = createHash("sha256")
    .update(seatAction ? token : ip)
    .digest("hex")
    .slice(0, 24);
  if (!(await store.allow(rateId, seatAction ? 180 : 40)))
    throw new GameError(
      "Too many requests. Take a breather and try again in a minute.",
      429,
    );
  if (data.type === "create") {
    const { player, token: newToken } = newPlayer(data.name, data.avatar, now);
    for (let n = 0; n < 8; n++) {
      const code = roomCode();
      const room = newRoom(code, player, now);
      if (await store.compareAndSwap(code, null, JSON.stringify(room)))
        return {
          snapshot: snapshot(room, player.id, now),
          token: newToken,
          playerId: player.id,
        };
    }
    throw new GameError("Could not create a room. Try again.", 503);
  }
  if (typeof data.code !== "string" || !/^[A-Z2-9]{6}$/.test(data.code))
    throw new GameError("Enter the 6-character room code.");
  const code = data.code;
  if (data.type === "join") {
    const { player, token: newToken } = newPlayer(data.name, data.avatar, now);
    const room = await updateRoom(store, code, (room) => {
      advance(room, now);
      addPlayer(room, player);
      return room;
    });
    return {
      snapshot: snapshot(room, player.id, now),
      token: newToken,
      playerId: player.id,
    };
  }
  const room: Room = await updateRoom(store, code, (room) => {
    const player = authenticate(room, token);
    // Heartbeats are batched to avoid writing Redis on every poll.
    if (now - player.lastSeen >= 10_000) player.lastSeen = now;
    advance(room, now);
    applyAction(
      room,
      player,
      {
        type: String(data.type),
        move: data.move,
        round: data.round,
        gameId: data.gameId,
        targetId: data.targetId,
      },
      now,
    );
    return room;
  });
  return { snapshot: snapshot(room, authenticateForView(room, token), now) };
}
function authenticateForView(room: Room, token: string) {
  // Leaving removes a lobby seat. Its response does not need a new token.
  try {
    return authenticate(room, token).id;
  } catch {
    return "";
  }
}
