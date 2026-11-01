import {
  blocked,
  clearShot,
  CORE,
  distance,
  EXTRACTION,
  findPath,
  RELAYS,
  PICKUPS,
  segmentDistance,
  slideMove,
  SPAWNS,
  VENTS,
} from "./map";
import {
  EMPTY_INPUT,
  PROTOCOL,
  type PlayerCommand,
  type Difficulty,
  type Effect,
  type Enemy,
  type Hint,
  type Input,
  type Operative,
  type Seat,
  type World,
} from "./types";
import { DIFFICULTIES, EXTRACT_SECONDS, HACK_SECONDS } from "./balance";
import { DEFAULT_WEAPON, WEAPONS } from "./weapons";
import { projectiles, stepPlayer } from "./player";
import { ENEMIES, ENEMY_TYPES } from "./enemies";
import { ALLY_NAMES, allyInput } from "./ai";

export const MISSION_SECONDS = 240;
export const MAGAZINE = WEAPONS[DEFAULT_WEAPON].magazine;
export function createWorld(
  seats: Pick<Seat, "id" | "name" | "color">[],
  seed = 5347,
  difficulty: Difficulty = "casual",
  bots = 0,
): World {
  if (!seats.length || seats.length > 4)
    throw new Error("A raid needs 1–4 operatives.");
  const count = Math.max(0, Math.min(4 - seats.length, Math.floor(bots)));
  const colors = [0, 1, 2, 3].filter(c => !seats.some(p => p.color === c));
  const crew: (Pick<Seat, "id" | "name" | "color"> & { isBot?: boolean })[] = [...seats, ...Array.from({ length: count }, (_, i) => ({ id: `ai-${seed}-${i}`, name: ALLY_NAMES[i], color: colors[i], isBot: true }))];
  const w: World = {
    version: PROTOCOL,
    difficulty,
    bots: count,
    tick: 0,
    time: 0,
    status: "playing",
    reason: "",
    players: crew.map((p, i) => ({
      ...p,
      ...SPAWNS[i],
      angle: Math.PI,
      health: 100,
      shield: 50,
      ammo: MAGAZINE,
      weapon: DEFAULT_WEAPON,
      magazines: WEAPONS.map(w => w.magazine),
      reload: 0,
      fire: 0,
      dashTime: 0,
      dashCooldown: 0,
      lastDash: 0,
      hurt: 0,
      invulnerable: 3,
      moving: 0,
      kills: 0,
      revive: 0,
      lastInput: 0,
      inputStream: "", vx: 0, vz: 0, shots: 0, flash: 0,
    })),
    enemies: [],
    bullets: [],
    relays: RELAYS.map((r, i) => ({ ...r, id: i, progress: 0, done: false })),
    pickups: PICKUPS.map((p, i) => ({ ...p, id: i, active: true, respawn: 0 })),
    effects: [],
    hazards: [],
    strikeTimer: DIFFICULTIES[difficulty].strike,
    core: { ...CORE, carrier: null },
    nextId: 1,
    spawnTimer: difficulty === "casual" ? 7 : 2,
    kills: 0,
    extraction: 0,
    seed,
  };
  spawn(w, DIFFICULTIES[difficulty].guards ? DIFFICULTIES[difficulty].guards + Math.floor(seats.length / 2) : 0);
  return w;
}
function random(w: World) {
  w.seed = (Math.imul(w.seed, 1664525) + 1013904223) >>> 0;
  return w.seed / 4294967296;
}
function effect(w: World, kind: Effect["kind"], x: number, z: number) {
  w.effects.push({ id: w.nextId++, kind, x, z, t: w.time });
}
export function vaultOpen(w: World) {
  return w.relays.every((r) => r.done);
}
function spawn(w: World, count = 1) {
  const complete = w.relays.filter((r) => r.done).length;
  const balance = DIFFICULTIES[w.difficulty];
  for (let i = 0; i < count && w.enemies.length < balance.cap; i++) {
    const living = w.players.filter(p => p.health > 0);
    const safe = VENTS.filter(v => living.every(p => distance(v, p) > 10));
    const nearby = safe.filter(v => living.some(p => distance(v, p) < 32));
    const choices = nearby.length ? nearby : safe.length ? safe : VENTS;
    const p = choices[Math.floor(random(w) * choices.length)];
    const pool = complete >= 1 || w.time > 40 ? ENEMY_TYPES : ENEMY_TYPES.filter(t => t !== "juggernaut" && t !== "heavy");
    const type = pool[Math.floor(random(w) * pool.length)], definition = ENEMIES[type];
    const hp = Math.round(definition.hp * balance.hp * (1 + (w.players.length - 1) * .12));
    w.enemies.push({
      ...p,
      id: w.nextId++,
      angle: 0,
      hp, maxHp: hp, vx: 0, vz: 0,
      type,
      fire: 0.8 + random(w),
      path: [],
      pathTime: 0,
      hurt: 0,
    });
  }
}
export function interactionHint(w: World, id: string): Hint | null {
  const p = w.players.find((p) => p.id === id);
  if (!p || p.health <= 0) return null;
  const down = w.players.find(
    (q) => q.id !== id && q.health <= 0 && distance(p, q) < 2.1,
  );
  if (down)
    return {
      text: `REVIVE ${down.name.toUpperCase()}`,
      progress: down.revive / 2,
      key: "E",
    };
  const relay = w.relays.find((r) => !r.done && distance(p, r) < 2.1);
  if (relay)
    return {
      text: DIFFICULTIES[w.difficulty].perimeter && w.enemies.some((e) => distance(e, relay) < 3.4) ? "CLEAR THE RELAY PERIMETER" : "HOLD STILL · DISABLE RELAY",
      progress: relay.progress / HACK_SECONDS(w.difficulty),
      key: "E",
    };
  if (vaultOpen(w) && !w.core.carrier && distance(p, w.core) < 2.2)
    return { text: "TAKE THE VAULT CORE", progress: 0, key: "E" };
  if (w.core.carrier === id && distance(p, EXTRACTION) < 2.7)
    return {
      text: DIFFICULTIES[w.difficulty].perimeter && w.enemies.some((e) => distance(e, EXTRACTION) < 5) ? "CLEAR THE EXTRACTION ZONE" : "HOLD POSITION · EXTRACTING",
      progress: w.extraction / EXTRACT_SECONDS(w.difficulty),
      key: "",
    };
  return null;
}
export function stepWorld(
  w: World,
  inputs: Record<string, Input>,
  delta: number,
  commands?: Record<string, PlayerCommand[]>,
): void {
  if (w.status !== "playing") return;
  const dt = Math.max(0, Math.min(0.1, delta));
  if (!dt) return;
  w.tick++;
  w.time += dt;
  if (w.time >= MISSION_SECONDS) {
    w.status = "lost";
    w.reason = "Lockdown complete. The vault sealed itself.";
    return;
  }
  const open = vaultOpen(w);
  const balance = DIFFICULTIES[w.difficulty];
  const hacking = new Set<number>();
  for (const p of w.players) {
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.hurt = Math.max(0, p.hurt - dt);
    let input = p.isBot ? allyInput(w, p, open) : inputs[p.id] ?? EMPTY_INPUT;
    const batch = commands?.[p.id] ?? [{ input, dt }];
    for (const command of batch) {
      input = command.input;
      const event = stepPlayer(p, input, command.dt, open, w.core.carrier === p.id);
      if (event.dash) effect(w, "dash", p.x, p.z);
      if (event.shot) w.bullets.push(...projectiles(p, w.time, () => w.nextId++));
    }
    if (p.health <= 0) { p.moving = p.vx = p.vz = 0; continue; }
    if (p.hurt < (w.difficulty === "casual" ? 2 : 0.001) && p.shield < 50) p.shield = Math.min(50, p.shield + (w.difficulty === "casual" ? 12 : 7) * dt);
    if (input.interact) {
      const down = w.players.find(
        (q) => q.id !== p.id && q.health <= 0 && distance(p, q) < 2.1,
      );
      const relay = w.relays.find((r) => !r.done && distance(p, r) < 2.1);
      if (down) {
        down.revive += dt;
        if (down.revive >= 2) {
          down.health = 55;
          down.shield = 15;
          down.invulnerable = 2;
          down.revive = 0;
          effect(w, "heal", down.x, down.z);
        }
      } else if (!p.isBot && relay && !hacking.has(relay.id) && p.moving < 0.15 && (!balance.perimeter || (p.hurt < 4.25 && !w.enemies.some((e) => distance(e, relay) < 3.4)))) {
        hacking.add(relay.id);
        relay.progress += dt;
        if (relay.progress >= HACK_SECONDS(w.difficulty)) {
          relay.progress = HACK_SECONDS(w.difficulty);
          relay.done = true;
          effect(w, "hack", relay.x, relay.z);
          spawn(w, w.difficulty === "casual" ? 1 : 2 + w.players.length);
        }
      } else if (!p.isBot && vaultOpen(w) && !w.core.carrier && distance(p, w.core) < 2.2) {
        w.core.carrier = p.id;
        effect(w, "hack", p.x, p.z);
        spawn(w, w.difficulty === "casual" ? 2 : 4 + w.players.length);
      }
    }
    for (const pickup of w.pickups)
      if (pickup.active && (p.health < 100 || p.shield < 50) && distance(p, pickup) < 1) {
        p.health = Math.min(100, p.health + (w.difficulty === "casual" ? 70 : 40));
        p.shield = Math.min(50, p.shield + 25);
        pickup.active = false;
        pickup.respawn = balance.medkit;
        effect(w, "heal", p.x, p.z);
      }
  }
  for (const relay of w.relays)
    if (balance.perimeter && !relay.done && !hacking.has(relay.id)) relay.progress = Math.max(0, relay.progress - dt * 0.5);
  for (const pickup of w.pickups)
    if (!pickup.active) {
      pickup.respawn -= dt;
      if (pickup.respawn <= 0) pickup.active = true;
    }
  const alive = w.players.filter((p) => p.health > 0);
  if (!alive.length) {
    w.status = "lost";
    w.reason = "The crew is down. Security takes this round.";
    return;
  }
  w.spawnTimer -= dt;
  if (w.spawnTimer <= 0) {
    spawn(
      w,
      w.difficulty === "casual" ? 1 : Math.min(4, 1 + Math.floor(w.players.length / 2) + (w.core.carrier ? 1 : 0)),
    );
    w.spawnTimer = Math.max(
      w.difficulty === "casual" ? 4.5 : 1.15,
      (4.5 - w.relays.filter((r) => r.done).length * 0.65 - w.time / 150) * balance.spawn,
    );
  }
  for (const e of w.enemies) {
    e.fire -= dt;
    e.pathTime -= dt;
    e.hurt = Math.max(0, e.hurt - dt);
    const target = alive.reduce((a, b) =>
        distance(e, a) < distance(e, b) ? a : b,
      ),
      dist = distance(e, target);
    const definition = ENEMIES[e.type];
    const los = clearShot(e, target, open), dx = target.x - e.x, dz = target.z - e.z;
    e.angle = Math.atan2(dx, dz);
    const oldX = e.x, oldZ = e.z;
    if (dist > definition.range || !los) {
      if (e.pathTime <= 0) {
        // Breachers flank; riflemen close to their preferred firing distance.
        const flank = e.type === "raider" && dist > 9 ? (e.id % 2 ? 3 : -3) : 0;
        const goal = { x: target.x + Math.cos(e.angle) * flank, z: target.z - Math.sin(e.angle) * flank };
        e.path = findPath(e, goal, open);
        if (!e.path.length && e.type === "raider") e.path = findPath(e, target, open);
        e.pathTime = .8 + random(w) * .5;
      }
      while (e.path.length && distance(e, e.path[0]) < .5) e.path.shift();
      const next = e.path[0];
      if (next) {
        const length = Math.max(.001, distance(e, next)), speed = definition.speed * balance.speed;
        slideMove(e, (next.x - e.x) / length * speed * dt, (next.z - e.z) / length * speed * dt, .46, open);
      }
    } else if (dist < (e.type === "marksman" ? 10 : 3.5) && e.type !== "hunter" && e.type !== "raider") {
      const length = Math.max(.01, dist);
      slideMove(e, -dx / length * 1.7 * dt, -dz / length * 1.7 * dt, .46, open);
    } else if (definition.humanoid && e.type !== "juggernaut") {
      const side = Math.sin(w.time * .7 + e.id) > 0 ? 1 : -1;
      slideMove(e, Math.cos(e.angle) * side * .7 * dt, -Math.sin(e.angle) * side * .7 * dt, .46, open);
    }
    e.vx = (e.x - oldX) / dt; e.vz = (e.z - oldZ) / dt;
    if (e.fire <= 0 && dist < (e.type === "marksman" ? 30 : 22) && los) {
      const angle = Math.atan2(dx, dz) + (random(w) - .5) * .06;
      for (const offset of definition.spread) w.bullets.push({
        id: w.nextId++, x: e.x + Math.sin(angle + offset) * .7, z: e.z + Math.cos(angle + offset) * .7,
        vx: Math.sin(angle + offset) * definition.projectile, vz: Math.cos(angle + offset) * definition.projectile,
        life: e.type === "marksman" ? 1.8 : 2.2, enemy: true, owner: String(e.id),
        damage: Math.max(1, Math.round(definition.damage * balance.damage)), born: w.time,
      });
      e.fire = definition.rate / balance.speed;
    }
  }

  // Security paints the floor before a strike. The warning gives moving players time to dodge.
  w.strikeTimer -= dt;
  if (w.strikeTimer <= 0) {
    const target = alive[Math.floor(random(w) * alive.length)];
    w.hazards.push({ id: w.nextId++, x: target.x, z: target.z, born: w.time, delay: w.difficulty === "casual" ? 1.9 : 1.25, radius: w.difficulty === "casual" || w.difficulty === "tactical" ? 1.7 : 2.15, hit: false });
    w.strikeTimer = Math.max(2.6, balance.strike - w.relays.filter((r) => r.done).length * 0.6 - (w.core.carrier ? 1 : 0));
  }
  for (const hazard of w.hazards) {
    if (!hazard.hit && w.time - hazard.born >= hazard.delay) {
      hazard.hit = true;
      effect(w, "explosion", hazard.x, hazard.z);
      for (const p of alive)
        if (!p.invulnerable && distance(p, hazard) < hazard.radius) damage(w, p, Math.round(24 * balance.damage));
    }
  }
  w.hazards = w.hazards.filter((h) => w.time - h.born < h.delay + 0.55).slice(-8);
  const survivors: typeof w.bullets = [];
  for (const b of w.bullets) {
    const from = { x: b.x, z: b.z },
      to = { x: b.x + b.vx * dt, z: b.z + b.vz * dt };
    b.life -= dt;
    if (
      b.life <= 0 ||
      blocked(to.x, to.z, 0.07, open) ||
      !clearShot(from, to, open)
    ) {
      if (b.splash) blast(w, from, b.splash, b.owner, open);
      else effect(w, "hit", to.x, to.z);
      continue;
    }
    let hit = false;
    if (b.enemy) {
      for (const p of alive)
        if (segmentDistance(from, to, p) < 0.49) {
          hit = true;
          if (!p.invulnerable) {
            damage(w, p, b.damage);
          }
          break;
        }
    } else {
      for (const e of w.enemies)
        if (
          e.hp > 0 &&
          segmentDistance(from, to, e) < (e.type === "heavy" || e.type === "juggernaut" ? .68 : .55)
        ) {
          hitEnemy(w, e, b.damage, b.owner);
          e.hurt = 0.15;
          hit = true;
          if (b.splash) blast(w, e, b.splash, b.owner, open, e.id);
          else effect(w, e.hp <= 0 ? "explosion" : "hit", e.x, e.z);
          break;
        }
    }
    if (!hit) {
      b.x = to.x;
      b.z = to.z;
      survivors.push(b);
    }
  }
  w.bullets = survivors.slice(-180);
  w.enemies = w.enemies.filter((e) => e.hp > 0);
  w.effects = w.effects.filter((e) => w.time - e.t < 0.7).slice(-40);
  const carrier = w.players.find((p) => p.id === w.core.carrier);
  if (carrier && carrier.health > 0) {
    w.core.x = carrier.x;
    w.core.z = carrier.z;
    if (distance(carrier, EXTRACTION) < 2.7 && (!balance.perimeter || (carrier.hurt < 4.25 && !w.enemies.some((e) => distance(e, EXTRACTION) < 5)))) {
      w.extraction += dt;
      if (w.extraction >= EXTRACT_SECONDS(w.difficulty)) {
        w.status = "won";
        w.reason = "Core secured. The whole crew gets a cut.";
      }
    } else w.extraction = Math.max(0, w.extraction - dt * 2);
  } else w.extraction = 0;
}
function hitEnemy(w: World, enemy: Enemy, amount: number, owner: string) {
  if (enemy.hp <= 0) return;
  enemy.hp -= amount;
  if (enemy.hp <= 0) { w.kills++; const player = w.players.find(p => p.id === owner); if (player) player.kills++; }
}
function blast(w: World, center: {x:number;z:number}, radius: number, owner: string, open: boolean, direct = -1) {
  effect(w, "nova", center.x, center.z);
  for (const enemy of w.enemies) if (enemy.id !== direct && enemy.hp > 0 && distance(enemy, center) < radius && clearShot(center, enemy, open)) hitEnemy(w, enemy, 110, owner);
}
function damage(w: World, p: Operative, amount: number) {
  const absorbed = Math.min(p.shield, amount);
  p.shield -= absorbed;
  p.health = Math.max(0, p.health - (amount - absorbed));
  p.hurt = 4.5;
  effect(w, "hit", p.x, p.z);
  if (p.health === 0 && w.core.carrier === p.id) {
    w.core.carrier = null;
    w.core.x = p.x;
    w.core.z = p.z;
  }
}
export function frame(w: World): World {
  // Navigation routes are host-only. Guests need just the visible state.
  return structuredClone({
    ...w,
    enemies: w.enemies.map((e) => ({ ...e, path: [] })),
  });
}
