import type { Obstacle, Vec2 } from "./types";
export const BOUNDS = { x: 50, z: 40 };
export const EXTRACTION: Vec2 = { x: -38, z: 28 };
export const CORE: Vec2 = { x: 0, z: -14.8 };
export const RELAYS: Vec2[] = [
  { x: -38, z: -24 },
  { x: 38, z: -24 },
  { x: 30, z: 28 },
];
export const SPAWNS: Vec2[] = [
  { x: -38, z: 27 },
  { x: -36, z: 28 },
  { x: -40, z: 29 },
  { x: -37, z: 31 },
];
export const VENTS: Vec2[] = [
  { x: -22, z: -17 },
  { x: 22, z: -17 },
  { x: 22, z: 17 },
  { x: 0, z: 18 },
  { x: -46, z: -32 }, { x: 46, z: -32 },
  { x: 46, z: 33 }, { x: -46, z: 33 },
  { x: -32, z: 5 }, { x: 32, z: 5 }, { x: 0, z: -32 },
];
export const PICKUPS: Vec2[] = [
  { x: -8, z: 14 }, { x: 17, z: 0 }, { x: -15, z: -16 },
  { x: -38, z: 8 }, { x: 38, z: 10 }, { x: 17, z: -31 },
];
export const DISTRICTS = [
  { x: -34, z: 33, name: "LOADING DOCKS" },
  { x: -34, z: -31, name: "WEST SECURITY" },
  { x: 34, z: -31, name: "NORTH ANNEX" },
  { x: 32, z: 34, name: "FREIGHT YARD" },
  { x: 0, z: -23, name: "CENTRAL VAULT" },
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
  { x: 0, z: -19.6, w: 13, d: .8, h: 4, kind: "wall" },
  { x: -27, z: 18, w: 5, d: 3, h: 1.8, kind: "crate" },
  { x: -39, z: 18, w: 3, d: 4, h: 2, kind: "crate" },
  { x: -32, z: -13, w: 5, d: 2.8, h: 1.6, kind: "crate" },
  { x: -42, z: -7, w: 3, d: 5, h: 1.8, kind: "crate" },
  { x: -27, z: -30, w: 5, d: 3, h: 2.2, kind: "crate" },
  { x: -42, z: -32, w: 3, d: 3, h: 1.6, kind: "crate" },
  { x: -18, z: 29, w: 3, d: 5, h: 1.8, kind: "crate" },
  { x: -3, z: 31, w: 6, d: 3, h: 2.2, kind: "crate" },
  { x: 15, z: 26, w: 3, d: 4, h: 1.8, kind: "crate" },
  { x: 39, z: 20, w: 4, d: 3, h: 2, kind: "crate" },
  { x: 43, z: 32, w: 3, d: 3, h: 1.6, kind: "crate" },
  { x: 27, z: 14, w: 4, d: 2.6, h: 1.6, kind: "crate" },
  { x: 35, z: -8, w: 5, d: 3, h: 1.8, kind: "crate" },
  { x: 43, z: -16, w: 3, d: 4, h: 2.2, kind: "crate" },
  { x: 27, z: -30, w: 4, d: 3, h: 1.8, kind: "crate" },
  { x: 42, z: -33, w: 4, d: 2.5, h: 1.8, kind: "crate" },
  { x: -14, z: -31, w: 4, d: 3, h: 1.8, kind: "crate" },
  { x: 4, z: -31, w: 3, d: 3, h: 1.8, kind: "crate" },
  { x: -26, z: 2, w: .8, d: 10, h: 2.5, kind: "wall" },
  { x: 26, z: -14, w: .8, d: 9, h: 2.5, kind: "wall" },
  { x: 14, z: 17, w: 9, d: .8, h: 2.2, kind: "wall" },
  { x: -15, z: -23, w: 9, d: .8, h: 2.2, kind: "wall" },
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
const NAV_CELL = 1.25;
const NAV_W = Math.floor((BOUNDS.x * 2 - 2) / NAV_CELL) + 1;
const NAV_H = Math.floor((BOUNDS.z * 2 - 2) / NAV_CELL) + 1;
const navPoint = (id: number): Vec2 => ({ x: (id % NAV_W) * NAV_CELL - BOUNDS.x + 1, z: Math.floor(id / NAV_W) * NAV_CELL - BOUNDS.z + 1 });
const navCache = new Map<boolean, Uint8Array>();
function navGrid(open: boolean) {
  let grid = navCache.get(open);
  if (!grid) {
    grid = Uint8Array.from({ length: NAV_W * NAV_H }, (_, id) => { const p = navPoint(id); return blocked(p.x, p.z, .48, open) ? 0 : 1; });
    navCache.set(open, grid);
  }
  return grid;
}
export function walkableLine(a: Vec2, b: Vec2, open: boolean) {
  return !blocked(b.x, b.z, .48, open) && !OBSTACLES.some(o => !(o.kind === "door" && open) && segmentHitsBox(a, b, o, .48));
}
/** Cached navigation grid + A*. The grid covers the entire expanded compound. */
export function findPath(start: Vec2, end: Vec2, doorOpen: boolean): Vec2[] {
  if (walkableLine(start, end, doorOpen)) return [{ ...end }];
  const grid = navGrid(doorOpen);
  const nearest = (p: Vec2) => {
    const x = Math.max(0, Math.min(NAV_W - 1, Math.round((p.x + BOUNDS.x - 1) / NAV_CELL)));
    const z = Math.max(0, Math.min(NAV_H - 1, Math.round((p.z + BOUNDS.z - 1) / NAV_CELL)));
    let best = -1, score = Infinity;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, nz = z + dz, id = nz * NAV_W + nx;
      if (nx < 0 || nx >= NAV_W || nz < 0 || nz >= NAV_H || !grid[id]) continue;
      const q = navPoint(id), d = distance(p, q);
      if (d < score && walkableLine(p, q, doorOpen)) { best = id; score = d; }
    }
    return best;
  };
  const a = nearest(start), b = nearest(end);
  if (a < 0 || b < 0) return [];
  const previous = new Int32Array(grid.length).fill(-1), costs = new Float32Array(grid.length).fill(Infinity);
  const closed = new Uint8Array(grid.length), heap: { id: number; f: number }[] = [];
  const push = (id: number, f: number) => {
    let i = heap.length; heap.push({ id, f });
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent].f <= f) break; heap[i] = heap[parent]; i = parent; }
    heap[i] = { id, f };
  };
  const pop = () => {
    const root = heap[0], tail = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child++; if (heap[child].f >= tail.f) break; heap[i] = heap[child]; i = child; }
      heap[i] = tail;
    }
    return root.id;
  };
  const goal = navPoint(b);
  costs[a] = 0; push(a, distance(navPoint(a), goal));
  while (heap.length) {
    const id = pop(); if (closed[id]) continue; closed[id] = 1;
    if (id === b) {
      const path: Vec2[] = [{ ...end }];
      for (let n = b; n >= 0; n = previous[n]) path.push(navPoint(n));
      return path.reverse();
    }
    const x = id % NAV_W, z = Math.floor(id / NAV_W);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz, next = nz * NAV_W + nx;
      if (nx < 0 || nx >= NAV_W || nz < 0 || nz >= NAV_H || !grid[next] || closed[next]) continue;
      if (dx && dz && (!grid[z * NAV_W + nx] || !grid[nz * NAV_W + x])) continue;
      const cost = costs[id] + NAV_CELL * (dx && dz ? Math.SQRT2 : 1);
      if (cost >= costs[next]) continue;
      costs[next] = cost; previous[next] = id; push(next, cost + distance(navPoint(next), goal));
    }
  }
  return [];
}
