import { clearShot, distance, findPath, walkableLine } from "./map";
import { EMPTY_INPUT, type Input, type Operative, type Vec2, type World } from "./types";

export const ALLY_NAMES = ["VEX", "BOLT", "ECHO"];
const brains = new WeakMap<World, Map<string, { path: Vec2[]; until: number; goal: Vec2 }>>();

/** Host-only squad AI. These operatives use exactly the same movement and guns as people. */
export function allyInput(w: World, p: Operative, open: boolean): Input {
  const input = { ...EMPTY_INPUT, seq: w.tick, dash: p.lastDash, weapon: 0 as const };
  if (p.health <= 0) return input;
  const humans = w.players.filter(q => !q.isBot);
  const down = humans.filter(q => q.health <= 0).sort((a, b) => distance(p, a) - distance(p, b))[0];
  const leader = humans.find(q => q.id === w.core.carrier && q.health > 0) ?? humans.filter(q => q.health > 0).sort((a, b) => distance(p, a) - distance(p, b))[0] ?? down;
  if (!leader) return input;
  const target = w.enemies.filter(e => e.hp > 0 && distance(p, e) < 23 && clearShot(p, e, open)).sort((a, b) => distance(p, a) - distance(p, b))[0];
  if (target) { input.ax = target.x - p.x; input.az = target.z - p.z; const n = Math.max(.001, Math.hypot(input.ax, input.az)); input.ax /= n; input.az /= n; input.shoot = true; }
  const index = w.players.filter(q => q.isBot).findIndex(q => q.id === p.id);
  const angle = (index + 1) * 2.1;
  let goal: Vec2 = down ? { x: down.x, z: down.z } : { x: leader.x + Math.sin(angle) * 2.6, z: leader.z + Math.cos(angle) * 2.6 };
  if (!walkableLine(leader, goal, open)) goal = { x: leader.x, z: leader.z };
  if (down && distance(p, down) < 1.8) { input.interact = true; return input; }
  const hazard = w.hazards.find(h => !h.hit && distance(p, h) < h.radius + .7);
  if (hazard) { const a = distance(p, hazard) < .1 ? angle : Math.atan2(p.x - hazard.x, p.z - hazard.z); goal = { x: p.x + Math.sin(a) * 4, z: p.z + Math.cos(a) * 4 }; }
  const shouldMove = hazard || distance(p, goal) > (down ? 1.7 : 1.2);
  if (shouldMove) {
    let map = brains.get(w); if (!map) brains.set(w, map = new Map());
    let brain = map.get(p.id);
    if (!brain || w.time > brain.until || distance(brain.goal, goal) > 3) {
      brain = { path: findPath(p, goal, open), until: w.time + .6, goal }; map.set(p.id, brain);
    }
    while (brain.path.length && distance(p, brain.path[0]) < .5) brain.path.shift();
    const next = brain.path[0];
    if (next) { const d = Math.max(.01, distance(p, next)); input.mx = (next.x - p.x) / d; input.mz = (next.z - p.z) / d; if (!target) { input.ax = input.mx; input.az = input.mz; } }
  }
  return input;
}
