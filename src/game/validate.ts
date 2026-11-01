import { EMPTY_INPUT, type Input, type Room, type World } from "./types.js";
import { isDifficulty } from "./balance.js";
import { isWeapon, WEAPONS } from "./weapons.js";
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
    w.version === 3 &&
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
    w.players.length === ids.length &&
    new Set(w.players.map((p) => p.id)).size === ids.length &&
    w.players.every(
      (p) =>
        ids.includes(p.id) &&
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
        e.path.length <= 100 &&
        e.path.every(position) &&
        ["drone", "heavy", "hunter"].includes(e.type),
    ) &&
    Array.isArray(w.bullets) &&
    w.bullets.length <= 200 &&
    w.bullets.every(
      (b) =>
        position(b) &&
        typeof b.owner === "string" &&
        typeof b.enemy === "boolean" &&
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
    w.pickups.length === 3 &&
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
      ["lobby", "playing", "finished"].includes(r.phase) && [null, "won", "lost", "aborted"].includes(r.result) &&
      Array.isArray(r.players) && r.players.length <= 4 &&
      new Set(r.players.map((p) => p.id)).size === r.players.length &&
      r.players.every((p) => typeof p.id === "string" && p.id.length > 0 && p.id.length < 100 && typeof p.name === "string" && p.name.length > 0 && p.name.length <= 18 && Number.isInteger(p.color) && p.color >= 0 && p.color < 4 && typeof p.online === "boolean");
  } catch { return false; }
}
