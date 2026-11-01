import { EMPTY_INPUT, PROTOCOL, type Input, type PlayerCommand, type Room, type World } from "./types.js";
import { isDifficulty } from "./balance.js";
import { isWeapon, WEAPONS } from "./weapons.js";
import { ENEMY_TYPES } from "./enemies.js";
import { PICKUPS } from "./map.js";
export function sanitizeInput(value: unknown): Input | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    !["mx", "mz", "ax", "az", "dash", "seq"].every(
      (k) => typeof v[k] === "number" && Number.isFinite(v[k]),
    )
  )
    return null;
  const clamp = (n: unknown) => Math.max(-1, Math.min(1, Number(n)));
  return {
    ...EMPTY_INPUT,
    mx: clamp(v.mx),
    mz: clamp(v.mz),
    ax: clamp(v.ax),
    az: clamp(v.az),
    dash: Math.max(0, Math.floor(Number(v.dash))),
    seq: Math.max(0, Math.floor(Number(v.seq))),
    shoot: v.shoot === true,
    interact: v.interact === true,
    reload: v.reload === true,
    weapon: isWeapon(v.weapon) ? v.weapon : -1,
  };
}
export function sanitizeCommands(value: unknown): PlayerCommand[] | null {
  if (!Array.isArray(value) || value.length > 64) return null;
  const result: PlayerCommand[] = [];
  for (const command of value) {
    if (!command || typeof command !== "object" || !Number.isFinite(command.dt) || command.dt <= 0 || command.dt > .05) return null;
    const input = sanitizeInput(command.input);
    if (!input || input.seq < 1 || (result.length && input.seq <= result[result.length - 1].input.seq)) return null;
    result.push({ input, dt: command.dt });
  }
  return result;
}
export function validWorld(value: unknown, ids: string[]): value is World {
  // All packets are untrusted, including cached frames from a previous deployment.
  try { return checkWorld(value, ids); } catch { return false; }
}
function checkWorld(value: unknown, ids: string[]): value is World {
  if (!value || typeof value !== "object") return false;
  const w = value as World;
  const position = (p: unknown) =>
    !!p &&
    typeof p === "object" &&
    ["x", "z"].every(
      (k) =>
        Number.isFinite((p as Record<string, number>)[k]) &&
        Math.abs((p as Record<string, number>)[k]) < 60,
    );
  return (
    w.version === PROTOCOL &&
    isDifficulty(w.difficulty) &&
    ids.length > 0 && ids.length <= 4 &&
    Number.isFinite(w.time) &&
    w.time >= 0 &&
    w.time <= 241 &&
    Number.isSafeInteger(w.tick) &&
    w.tick >= 0 &&
    ["playing", "won", "lost", "aborted"].includes(w.status) &&
    typeof w.reason === "string" &&
    w.reason.length < 200 &&
    Array.isArray(w.players) &&
    Number.isInteger(w.bots) && w.bots >= 0 && w.bots <= 4 - ids.length &&
    w.players.length === ids.length + w.bots && w.players.length <= 4 &&
    new Set(w.players.map((p) => p.id)).size === w.players.length &&
    w.players.filter(p => p.isBot === true).length === w.bots &&
    ids.every(id => w.players.some(p => p.id === id && !p.isBot)) &&
    w.players.every(
      (p) =>
        (p.isBot === true ? /^ai-\d+-[0-2]$/.test(p.id) && !ids.includes(p.id) : ids.includes(p.id)) &&
        typeof p.inputStream === "string" && p.inputStream.length <= 80 &&
        position(p) &&
        typeof p.name === "string" &&
        p.name.length > 0 &&
        p.name.length <= 18 &&
        Number.isInteger(p.color) &&
        p.color >= 0 &&
        p.color < 4 &&
        p.health >= 0 &&
        p.health <= 100 &&
        p.shield >= 0 &&
        p.shield <= 50 &&
        isWeapon(p.weapon) && p.ammo >= 0 && p.ammo <= WEAPONS[p.weapon].magazine &&
        Array.isArray(p.magazines) && p.magazines.length === WEAPONS.length && p.magazines.every((ammo, i) => Number.isFinite(ammo) && ammo >= 0 && ammo <= WEAPONS[i].magazine) &&
        [
          "angle",
          "health",
          "shield",
          "ammo",
          "fire",
          "dashTime",
          "dashCooldown",
          "lastDash",
          "reload",
          "hurt",
          "invulnerable",
          "moving",
          "kills",
          "revive",
          "lastInput",
          "vx", "vz", "shots", "flash",
        ].every((k) =>
          Number.isFinite((p as unknown as Record<string, number>)[k]),
        ),
    ) &&
    Array.isArray(w.enemies) &&
    w.enemies.length <= 24 &&
    w.enemies.every(
      (e) =>
        position(e) &&
        ["id", "angle", "hp", "fire", "pathTime", "hurt"].every((k) =>
          Number.isFinite((e as unknown as Record<string, number>)[k]),
        ) &&
        Array.isArray(e.path) &&
        e.path.length <= 256 &&
        e.path.every(position) &&
        ENEMY_TYPES.includes(e.type) &&
        (e.maxHp === undefined || Number.isFinite(e.maxHp)) &&
        (e.vx === undefined || Number.isFinite(e.vx)) && (e.vz === undefined || Number.isFinite(e.vz)),
    ) &&
    Array.isArray(w.bullets) &&
    w.bullets.length <= 200 &&
    w.bullets.every(
      (b) =>
        position(b) &&
        typeof b.owner === "string" &&
        typeof b.enemy === "boolean" &&
        (b.shot === undefined || (typeof b.shot === "string" && b.shot.length < 240)) &&
        (b.born === undefined || Number.isFinite(b.born)) &&
        (b.weapon === undefined || isWeapon(b.weapon)) &&
        (b.splash === undefined || (Number.isFinite(b.splash) && b.splash >= 0 && b.splash <= 3)) &&
        ["id", "vx", "vz", "life", "damage"].every((k) =>
          Number.isFinite((b as unknown as Record<string, number>)[k]),
        ),
    ) &&
    Array.isArray(w.relays) &&
    w.relays.length === 3 &&
    w.relays.every(
      (r) =>
        position(r) &&
        Number.isInteger(r.id) && r.id >= 0 && r.id < 3 &&
        typeof r.done === "boolean" &&
        Number.isFinite(r.progress),
    ) &&
    new Set(w.relays.map((r) => r.id)).size === 3 &&
    Array.isArray(w.pickups) &&
    w.pickups.length === PICKUPS.length &&
    w.pickups.every((p) => position(p) && typeof p.active === "boolean" && Number.isFinite(p.respawn)) &&
    Array.isArray(w.effects) &&
    w.effects.length <= 40 &&
    w.effects.every(
      (e) =>
        position(e) &&
        Number.isFinite(e.t) &&
        Number.isFinite(e.id) &&
        ["hit", "explosion", "nova", "hack", "heal", "dash"].includes(e.kind),
    ) &&
    Array.isArray(w.hazards) && w.hazards.length <= 8 &&
    w.hazards.every((h) => position(h) && Number.isSafeInteger(h.id) && Number.isFinite(h.born) && Number.isFinite(h.delay) && h.delay > 0 && h.delay < 5 && Number.isFinite(h.radius) && h.radius > 0 && h.radius < 8 && typeof h.hit === "boolean") &&
    Number.isFinite(w.strikeTimer) &&
    position(w.core) &&
    (w.core.carrier === null || ids.includes(w.core.carrier)) &&
    Number.isFinite(w.extraction) &&
    Number.isSafeInteger(w.nextId) &&
    Number.isFinite(w.spawnTimer) &&
    Number.isFinite(w.seed) &&
    Number.isFinite(w.kills)
  );
}
export function validRoom(value: unknown): value is Room {
  try {
    const r = value as Room;
    return !!r && typeof r === "object" && /^[A-Z2-9]{6}$/.test(r.code) && Number.isSafeInteger(r.version) && r.version > 0 &&
      typeof r.gameId === "string" && r.gameId.length > 0 && r.gameId.length < 100 &&
      typeof r.hostId === "string" && typeof r.selfId === "string" && isDifficulty(r.difficulty) &&
      Number.isInteger(r.bots) && r.bots >= 0 && r.bots <= 3 &&
      ["lobby", "playing", "finished"].includes(r.phase) && [null, "won", "lost", "aborted"].includes(r.result) &&
      Array.isArray(r.players) && r.players.length <= 4 &&
      r.players.length + r.bots <= 4 &&
      new Set(r.players.map((p) => p.id)).size === r.players.length &&
      r.players.every((p) => typeof p.id === "string" && p.id.length > 0 && p.id.length < 100 && typeof p.name === "string" && p.name.length > 0 && p.name.length <= 18 && Number.isInteger(p.color) && p.color >= 0 && p.color < 4 && typeof p.online === "boolean");
  } catch { return false; }
}
