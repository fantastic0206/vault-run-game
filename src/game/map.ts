import type { Obstacle, Vec2 } from "./types";
export const BOUNDS = { x: 25, z: 20 };
export const EXTRACTION: Vec2 = { x: -19, z: 15 };
export const CORE: Vec2 = { x: 0, z: -14.8 };
export const RELAYS: Vec2[] = [
  { x: -18, z: -12 },
  { x: 18, z: -12 },
  { x: 10, z: 12 },
];
export const SPAWNS: Vec2[] = [
  { x: -19, z: 14 },
  { x: -17, z: 15 },
  { x: -20.5, z: 16 },
  { x: -18.5, z: 17 },
];
export const VENTS: Vec2[] = [
  { x: -22, z: -17 },
  { x: 22, z: -17 },
  { x: 22, z: 17 },
  { x: 0, z: 18 },
];
export const OBSTACLES: Obstacle[] = [
  { x: -12, z: 5, w: 4, d: 2.4, h: 1.4, kind: "crate" },
  { x: 7, z: 3, w: 3, d: 3, h: 1.8, kind: "crate" },
  { x: -11, z: -7, w: 3, d: 4, h: 1.8, kind: "crate" },
  { x: 12, z: -6, w: 4, d: 2, h: 1.4, kind: "crate" },
  { x: 0, z: 6, w: 4, d: 2, h: 1.6, kind: "crate" },
  { x: 19, z: 5, w: 2.4, d: 4, h: 1.8, kind: "crate" },
  { x: -19, z: 0, w: 3, d: 3, h: 1.5, kind: "crate" },
  { x: -4, z: -1, w: 2, d: 3, h: 1.6, kind: "crate" },
  { x: 4, z: -4, w: 2.5, d: 2, h: 1.2, kind: "crate" },
  { x: -6.2, z: -14.5, w: 0.7, d: 10, h: 3.6, kind: "wall" },
  { x: 6.2, z: -14.5, w: 0.7, d: 10, h: 3.6, kind: "wall" },
  { x: 0, z: -9, w: 12, d: 0.8, h: 5, kind: "door" },
  { x: -23, z: -5, w: 1.3, d: 1.3, h: 3.6, kind: "pillar" },
  { x: 23, z: -5, w: 1.3, d: 1.3, h: 3.6, kind: "pillar" },
];
export function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
export function blocked(
  x: number,
  z: number,
  radius: number,
  doorOpen: boolean,
) {
  if (Math.abs(x) > BOUNDS.x - radius || Math.abs(z) > BOUNDS.z - radius)
    return true;
  return OBSTACLES.some(
    (o) =>
      !(o.kind === "door" && doorOpen) &&
      x > o.x - o.w / 2 - radius &&
      x < o.x + o.w / 2 + radius &&
      z > o.z - o.d / 2 - radius &&
      z < o.z + o.d / 2 + radius,
  );
}
export function slideMove(
  position: Vec2,
  dx: number,
  dz: number,
  radius: number,
  doorOpen: boolean,
) {
  // Substeps prevent dashes tunneling through thin walls.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  for (let i = 0; i < steps; i++) {
    if (!blocked(position.x + dx / steps, position.z, radius, doorOpen))
      position.x += dx / steps;
    if (!blocked(position.x, position.z + dz / steps, radius, doorOpen))
      position.z += dz / steps;
  }
}
export function segmentHitsBox(
  a: Vec2,
  b: Vec2,
  box: Obstacle,
  padding = 0,
): boolean {
  let lo = 0,
    hi = 1;
  for (const [origin, delta, min, max] of [
    [a.x, b.x - a.x, box.x - box.w / 2 - padding, box.x + box.w / 2 + padding],
    [a.z, b.z - a.z, box.z - box.d / 2 - padding, box.z + box.d / 2 + padding],
  ]) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const t1 = (min - origin) / delta,
      t2 = (max - origin) / delta;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
    if (lo > hi) return false;
  }
  return true;
}
export function clearShot(a: Vec2, b: Vec2, doorOpen: boolean) {
  return !OBSTACLES.some(
    (o) => !(o.kind === "door" && doorOpen) && segmentHitsBox(a, b, o),
  );
}
export function segmentDistance(a: Vec2, b: Vec2, p: Vec2) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    den = dx * dx + dz * dz;
  const t = den
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / den))
    : 0;
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
}
export function findPath(start: Vec2, end: Vec2, doorOpen: boolean): Vec2[] {
  const cell = 1.5,
    w = 33,
    h = 26;
  const grid = (p: Vec2) => ({
    x: Math.max(0, Math.min(w - 1, Math.round((p.x + 24) / cell))),
    z: Math.max(0, Math.min(h - 1, Math.round((p.z + 18.75) / cell))),
  });
  const world = (x: number, z: number) => ({
    x: x * cell - 24,
    z: z * cell - 18.75,
  });
  const a = grid(start),
    b = grid(end),
    key = (x: number, z: number) => z * w + x;
  const queue = [key(a.x, a.z)],
    previous = new Int32Array(w * h).fill(-2);
  previous[queue[0]] = -1;
  let found = -1;
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head],
      x = id % w,
      z = Math.floor(id / w);
    if (Math.abs(x - b.x) + Math.abs(z - b.z) <= 1) {
      found = id;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        nid = key(nx, nz);
      if (nx < 0 || nx >= w || nz < 0 || nz >= h || previous[nid] !== -2)
        continue;
      const p = world(nx, nz);
      if (blocked(p.x, p.z, 0.48, doorOpen)) continue;
      previous[nid] = id;
      queue.push(nid);
    }
  }
  if (found < 0) return [end];
  const path: Vec2[] = [];
  for (let id = found; previous[id] >= 0; id = previous[id])
    path.push(world(id % w, Math.floor(id / w)));
  return path.reverse();
}
