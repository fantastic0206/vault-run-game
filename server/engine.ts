import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Move, Phase, RoundResult, Snapshot } from "../src/types.ts";

export const ROUND_MS = 35_000;
export const REVEAL_MS = 16_000;
export const ONLINE_MS = 45_000;
export const ROOM_TTL_SECONDS = 21_600;
export const VAULTS = [
  {
    name: "The Corner Bank",
    pot: 16,
    tagline: "Every great heist starts small.",
  },
  { name: "The Midnight Express", pot: 24, tagline: "More gold. Less trust." },
  { name: "The Crown Vault", pot: 32, tagline: "One last job. Make it count." },
];

export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
    public kind = "game",
  ) {
    super(message);
  }
}
export interface Player {
  id: string;
  tokenHash: string;
  name: string;
  avatar: number;
  score: number;
  lastSeen: number;
  left: boolean;
}
export interface Room {
  code: string;
  version: number;
  gameId: string;
  createdAt: number;
  hostId: string;
  phase: Phase;
  round: number;
  deadline: number | null;
  players: Player[];
  moves: Record<string, Move | "skip">;
  ready: string[];
  history: RoundResult[];
}
export type Action = {
  type: string;
  move?: unknown;
  round?: unknown;
  gameId?: unknown;
  targetId?: unknown;
};
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function authenticate(room: Room, token: string): Player {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new GameError(
      "Your seat could not be verified. Join the room again.",
      401,
    );
  const hash = hashToken(token);
  const player = room.players.find((p) =>
    timingSafeEqual(Buffer.from(p.tokenHash), Buffer.from(hash)),
  );
  if (!player || player.left)
    throw new GameError(
      "Your seat is no longer in this room. Join again from the lobby.",
      401,
    );
  return player;
}
export function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new GameError("Enter a nickname first.");
  const name = value
    .replace(/[\p{C}<>]/gu, "")
    .trim()
    .replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 18)
    throw new GameError("Use a nickname between 1 and 18 characters.");
  return name;
}
export function newPlayer(
  name: unknown,
  avatar: unknown,
  now: number,
): { player: Player; token: string } {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    player: {
      id: randomUUID(),
      tokenHash: hashToken(token),
      name: cleanName(name),
      avatar:
        typeof avatar === "number" &&
        Number.isInteger(avatar) &&
        avatar >= 0 &&
        avatar < 8
          ? avatar
          : 0,
      score: 0,
      lastSeen: now,
      left: false,
    },
  };
}
export function roomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(6), (x) => chars[x % chars.length]).join("");
}
export function newRoom(code: string, player: Player, now: number): Room {
  return {
    code,
    version: 1,
    gameId: randomUUID(),
    createdAt: now,
    hostId: player.id,
    phase: "lobby",
    round: 0,
    deadline: null,
    players: [player],
    moves: {},
    ready: [],
    history: [],
  };
}
export function addPlayer(room: Room, player: Player): void {
  if (room.phase !== "lobby")
    throw new GameError(
      "This crew is mid-heist. Ask the host to open a new lobby after the game.",
      409,
    );
  if (room.players.length >= 8)
    throw new GameError(
      "This room is full. A maximum of 8 players can join.",
      409,
    );
  if (
    room.players.some((p) => p.name.toLowerCase() === player.name.toLowerCase())
  )
    throw new GameError(
      "That nickname is taken in this room. Try another one.",
      409,
    );
  room.players.push(player);
}
export function resolveRound(room: Room, now: number): void {
  const vault = VAULTS[room.round - 1];
  const moves = room.players.map((p) => ({
    player: p,
    move: room.moves[p.id] ?? ("skip" as const),
  }));
  const looters = moves.filter((p) => p.move === "loot");
  const thieves = moves.filter((p) => p.move === "steal");
  const guards = moves.filter((p) => p.move === "guard");
  const successfulSteal = thieves.length === 1 && guards.length === 0;
  let headline = "A clean getaway.";
  let description =
    "The looters split the vault. Any leftover gold stays behind.";
  if (thieves.length && guards.length) {
    headline = "Caught in the act.";
    description =
      "The guards blocked every thief. Each guard earns 6; each thief loses 3. Looters split the vault.";
  } else if (successfulSteal) {
    headline = `${thieves[0].player.name} stole the show.`;
    description =
      "One thief. No guards. The thief takes the entire vault; looters leave empty-handed.";
  } else if (thieves.length > 1) {
    headline = "Too many sticky fingers.";
    description =
      "Multiple thieves tripped the alarm. Each thief loses 3 gold; looters split the vault.";
  } else if (!looters.length) {
    headline = "The gold stayed put.";
    description =
      "No one looted or stole. Each guard earns 2 gold for a quiet shift.";
  }
  const result: RoundResult = {
    round: room.round,
    pot: vault.pot,
    title: vault.name,
    headline,
    description,
    players: moves.map(({ player, move }) => {
      const delta =
        move === "guard"
          ? thieves.length
            ? 6
            : 2
          : move === "steal"
            ? successfulSteal
              ? vault.pot
              : -3
            : move === "loot"
              ? successfulSteal
                ? 0
                : Math.floor(vault.pot / looters.length)
              : 0;
      player.score += delta;
      return {
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        move,
        delta,
        score: player.score,
      };
    }),
  };
  room.history.push(result);
  room.phase = "reveal";
  room.deadline = now + REVEAL_MS;
  room.ready = [];
}
function beginRound(room: Room, now: number) {
  room.round++;
  room.phase = "choosing";
  room.deadline = now + ROUND_MS;
  room.moves = {};
  room.ready = [];
  for (const player of room.players)
    if (player.left) room.moves[player.id] = "skip";
}
function nextRound(room: Room, now: number) {
  if (room.round === VAULTS.length) {
    room.phase = "finished";
    room.deadline = null;
  } else beginRound(room, now);
}
function allLocked(room: Room) {
  return room.players.every((p) => !!room.moves[p.id]);
}

/** Server clock is authoritative. Polls drive transitions, even after the host leaves. */
export function advance(room: Room, now: number): void {
  const host = room.players.find((p) => p.id === room.hostId);
  if (!host || host.left || now - host.lastSeen > ONLINE_MS) {
    const active = room.players.find(
      (p) => !p.left && now - p.lastSeen <= ONLINE_MS,
    );
    if (active) room.hostId = active.id;
  }
  if (room.phase === "choosing" && (allLocked(room) || now >= room.deadline!))
    resolveRound(room, now);
  else if (room.phase === "reveal" && now >= room.deadline!)
    nextRound(room, now);
}
export function applyAction(
  room: Room,
  player: Player,
  action: Action,
  now: number,
): void {
  const isHost = room.hostId === player.id;
  switch (action.type) {
    case "sync":
      return;
    case "start": {
      if (!isHost)
        throw new GameError("Only the host can start the heist.", 403);
      if (room.phase !== "lobby")
        throw new GameError("The heist has already started.", 409);
      const online = room.players.filter(
        (p) => !p.left && now - p.lastSeen <= ONLINE_MS,
      );
      if (online.length < 2)
        throw new GameError(
          "You need at least 2 connected players to start.",
          409,
        );
      room.players = online;
      beginRound(room, now);
      return;
    }
    case "choose": {
      if (action.gameId !== room.gameId || action.round !== room.round)
        throw new GameError(
          "The heist has moved on. Choose again for the current round.",
          409,
        );
      if (room.phase !== "choosing")
        throw new GameError(
          "This round is already locked. See the reveal!",
          409,
        );
      if (!["loot", "steal", "guard"].includes(String(action.move)))
        throw new GameError("Choose Loot, Steal, or Guard.");
      if (room.moves[player.id] && room.moves[player.id] !== action.move)
        throw new GameError("Your move is locked for this heist.", 409);
      room.moves[player.id] = action.move as Move;
      if (allLocked(room)) resolveRound(room, now);
      return;
    }
    case "ready": {
      if (
        action.gameId !== room.gameId ||
        action.round !== room.round ||
        room.phase !== "reveal"
      )
        throw new GameError("The next heist is already on its way.", 409);
      if (!room.ready.includes(player.id)) room.ready.push(player.id);
      const active = room.players.filter(
        (p) => !p.left && now - p.lastSeen <= ONLINE_MS,
      );
      if (active.every((p) => room.ready.includes(p.id))) nextRound(room, now);
      return;
    }
    case "rematch": {
      if (!isHost)
        throw new GameError("Only the host can open the next lobby.", 403);
      if (room.phase !== "finished")
        throw new GameError("Finish this game first.", 409);
      room.phase = "lobby";
      room.round = 0;
      room.deadline = null;
      room.gameId = randomUUID();
      room.history = [];
      room.moves = {};
      room.ready = [];
      room.players = room.players.filter((p) => !p.left);
      for (const p of room.players) p.score = 0;
      return;
    }
    case "remove": {
      if (!isHost || room.phase !== "lobby")
        throw new GameError(
          "Only the host can remove a disconnected player from the lobby.",
          403,
        );
      const target = room.players.find((p) => p.id === action.targetId);
      if (
        !target ||
        target.id === player.id ||
        now - target.lastSeen <= ONLINE_MS
      )
        throw new GameError("Only disconnected seats can be removed.", 409);
      room.players = room.players.filter((p) => p.id !== target.id);
      return;
    }
    case "leave": {
      if (room.phase === "lobby")
        room.players = room.players.filter((p) => p.id !== player.id);
      else {
        player.left = true;
        player.lastSeen = 0;
        if (!room.moves[player.id]) room.moves[player.id] = "skip";
      }
      if (isHost) room.hostId = room.players.find((p) => !p.left)?.id ?? "";
      advance(room, now);
      return;
    }
    default:
      throw new GameError("Unknown game action.");
  }
}
export function snapshot(room: Room, playerId: string, now: number): Snapshot {
  const vault = VAULTS[Math.max(0, room.round - 1)];
  const ownMove = room.moves[playerId];
  return {
    code: room.code,
    version: room.version,
    gameId: room.gameId,
    phase: room.phase,
    hostId: room.hostId,
    selfId: playerId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      online: !p.left && now - p.lastSeen <= ONLINE_MS,
      left: p.left,
      locked: !!room.moves[p.id],
      ready: room.ready.includes(p.id),
    })),
    round: room.round,
    totalRounds: VAULTS.length,
    pot: vault.pot,
    vaultName: vault.name,
    deadline: room.deadline,
    serverTime: now,
    ownMove: ownMove && ownMove !== "skip" ? ownMove : null,
    history: room.history,
  };
}
