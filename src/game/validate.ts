import { EMPTY_INPUT, type Input, type World } from "./types.js";
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
  };
}
export function validWorld(value: unknown, ids: string[]): value is World {
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
    w.version === 1 &&
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
        ["drone", "heavy"].includes(e.type),
    ) &&
    Array.isArray(w.bullets) &&
    w.bullets.length <= 200 &&
    w.bullets.every(
      (b) =>
        position(b) &&
        typeof b.owner === "string" &&
        typeof b.enemy === "boolean" &&
        ["id", "vx", "vz", "life", "damage"].every((k) =>
          Number.isFinite((b as unknown as Record<string, number>)[k]),
        ),
    ) &&
    Array.isArray(w.relays) &&
    w.relays.length === 3 &&
    w.relays.every(
      (r) =>
        position(r) &&
        typeof r.done === "boolean" &&
        Number.isFinite(r.progress),
    ) &&
    Array.isArray(w.pickups) &&
    w.pickups.length === 3 &&
    w.pickups.every((p) => position(p) && typeof p.active === "boolean") &&
    Array.isArray(w.effects) &&
    w.effects.length <= 40 &&
    w.effects.every(
      (e) =>
        position(e) &&
        Number.isFinite(e.t) &&
        Number.isFinite(e.id) &&
        ["hit", "explosion", "hack", "heal", "dash"].includes(e.kind),
    ) &&
    position(w.core) &&
    (w.core.carrier === null || ids.includes(w.core.carrier)) &&
    Number.isFinite(w.extraction) &&
    Number.isSafeInteger(w.nextId) &&
    Number.isFinite(w.spawnTimer) &&
    Number.isFinite(w.seed) &&
    Number.isFinite(w.kills)
  );
}
