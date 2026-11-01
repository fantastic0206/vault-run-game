import {
  blocked,
  clearShot,
  CORE,
  distance,
  EXTRACTION,
  findPath,
  RELAYS,
  segmentDistance,
  slideMove,
  SPAWNS,
  VENTS,
} from "./map";
import {
  EMPTY_INPUT,
  type Effect,
  type Enemy,
  type Hint,
  type Input,
  type Operative,
  type Seat,
  type World,
} from "./types";

export const MISSION_SECONDS = 240;
export const MAGAZINE = 14;
export function createWorld(
  seats: Pick<Seat, "id" | "name" | "color">[],
  seed = 5347,
): World {
  if (!seats.length || seats.length > 4)
    throw new Error("A raid needs 1–4 operatives.");
  return {
    version: 1,
    tick: 0,
    time: 0,
    status: "playing",
    reason: "",
    players: seats.map((p, i) => ({
      ...p,
      ...SPAWNS[i],
      angle: Math.PI,
      health: 100,
      shield: 50,
      ammo: MAGAZINE,
      reload: 0,
      fire: 0,
      dashTime: 0,
      dashCooldown: 0,
      lastDash: 0,
      hurt: 0,
      invulnerable: 1,
      moving: 0,
      kills: 0,
      revive: 0,
      lastInput: 0,
    })),
    enemies: [],
    bullets: [],
    relays: RELAYS.map((r, i) => ({ ...r, id: i, progress: 0, done: false })),
    pickups: [
      { x: -8, z: 14 },
      { x: 17, z: 0 },
      { x: -15, z: -16 },
    ].map((p, i) => ({ ...p, id: i, active: true, respawn: 0 })),
    effects: [],
    core: { ...CORE, carrier: null },
    nextId: 1,
    spawnTimer: 2.5,
    kills: 0,
    extraction: 0,
    seed,
  };
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
  for (let i = 0; i < count && w.enemies.length < 18; i++) {
    const p = VENTS[Math.floor(random(w) * VENTS.length)];
    const heavy = complete >= 2 && random(w) > 0.64;
    w.enemies.push({
      ...p,
      id: w.nextId++,
      angle: 0,
      hp: heavy ? 72 : 36,
      type: heavy ? "heavy" : "drone",
      fire: 1.1 + random(w),
      path: [],
      pathTime: 0,
      hurt: 0,
    });
  }
}
function shoot(w: World, p: Operative, ax: number, az: number) {
  w.bullets.push({
    id: w.nextId++,
    x: p.x + ax * 0.8,
    z: p.z + az * 0.8,
    vx: ax * 31,
    vz: az * 31,
    life: 1.4,
    enemy: false,
    owner: p.id,
    damage: 18,
  });
  p.ammo--;
  p.fire = 0.135;
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
      text: "DISABLE SECURITY RELAY",
      progress: relay.progress / 1.65,
      key: "E",
    };
  if (vaultOpen(w) && !w.core.carrier && distance(p, w.core) < 2.2)
    return { text: "TAKE THE VAULT CORE", progress: 0, key: "E" };
  if (w.core.carrier === id && distance(p, EXTRACTION) < 2.7)
    return {
      text: "HOLD POSITION · EXTRACTING",
      progress: w.extraction / 2,
      key: "",
    };
  return null;
}
export function stepWorld(
  w: World,
  inputs: Record<string, Input>,
  delta: number,
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
  for (const p of w.players) {
    p.fire = Math.max(0, p.fire - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.dashTime = Math.max(0, p.dashTime - dt);
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.hurt = Math.max(0, p.hurt - dt);
    if (p.health <= 0) {
      p.moving = 0;
      continue;
    }
    const input = inputs[p.id] ?? EMPTY_INPUT;
    const len = Math.hypot(input.mx, input.mz),
      mx = len > 1 ? input.mx / len : input.mx,
      mz = len > 1 ? input.mz / len : input.mz;
    const aim = Math.hypot(input.ax, input.az),
      ax = aim > 0.1 ? input.ax / aim : Math.sin(p.angle),
      az = aim > 0.1 ? input.az / aim : Math.cos(p.angle);
    p.angle = Math.atan2(ax, az);
    p.moving = Math.hypot(mx, mz);
    if (input.dash > p.lastDash) {
      p.lastDash = input.dash;
      if (p.dashCooldown === 0 && p.moving > 0.05) {
        p.dashTime = 0.18;
        p.dashCooldown = 2.4;
        p.invulnerable = 0.26;
        effect(w, "dash", p.x, p.z);
      }
    }
    const speed = p.dashTime > 0 ? 22 : w.core.carrier === p.id ? 5.4 : 6.7;
    slideMove(p, mx * speed * dt, mz * speed * dt, 0.42, open);
    if (p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) {
        p.reload = 0;
        p.ammo = MAGAZINE;
      }
    }
    if (!p.reload && ((input.reload && p.ammo < MAGAZINE) || p.ammo === 0))
      p.reload = 1.2;
    if (input.shoot && p.fire === 0 && !p.reload && p.ammo > 0)
      shoot(w, p, ax, az);
    if (!p.hurt && p.shield < 50) p.shield = Math.min(50, p.shield + 7 * dt);
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
      } else if (relay) {
        relay.progress += dt;
        if (relay.progress >= 1.65) {
          relay.progress = 1.65;
          relay.done = true;
          effect(w, "hack", relay.x, relay.z);
          spawn(w, 2 + w.players.length);
        }
      } else if (vaultOpen(w) && !w.core.carrier && distance(p, w.core) < 2.2) {
        w.core.carrier = p.id;
        effect(w, "hack", p.x, p.z);
        spawn(w, 4);
      }
    }
    for (const pickup of w.pickups)
      if (pickup.active && p.health < 100 && distance(p, pickup) < 1) {
        p.health = Math.min(100, p.health + 40);
        pickup.active = false;
        pickup.respawn = 35;
        effect(w, "heal", p.x, p.z);
      }
  }
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
      w.time > 60 ? Math.min(3, 1 + Math.floor(w.players.length / 2)) : 1,
    );
    w.spawnTimer = Math.max(
      2.1,
      5.5 - w.relays.filter((r) => r.done).length * 0.7 - w.time / 180,
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
    const los = clearShot(e, target, open),
      dx = target.x - e.x,
      dz = target.z - e.z;
    e.angle = Math.atan2(dx, dz);
    if (dist > 8 || !los) {
      if (e.pathTime <= 0) {
        e.path = los
          ? [{ x: target.x, z: target.z }]
          : findPath(e, target, open);
        e.pathTime = 0.8 + random(w) * 0.5;
      }
      while (e.path.length && distance(e, e.path[0]) < 0.5) e.path.shift();
      const step = e.path[0] ?? target,
        l = Math.max(0.001, distance(e, step)),
        speed = e.type === "heavy" ? 1.8 : 2.8;
      slideMove(
        e,
        ((step.x - e.x) / l) * speed * dt,
        ((step.z - e.z) / l) * speed * dt,
        0.46,
        open,
      );
    } else if (dist < 4) {
      const l = Math.max(0.01, dist);
      slideMove(e, (-dx / l) * 1.7 * dt, (-dz / l) * 1.7 * dt, 0.46, open);
    }
    if (e.fire <= 0 && dist < 19 && los) {
      const l = Math.max(0.01, dist),
        spread = (random(w) - 0.5) * 0.075,
        angle = Math.atan2(dx, dz) + spread;
      w.bullets.push({
        id: w.nextId++,
        x: e.x + Math.sin(angle) * 0.7,
        z: e.z + Math.cos(angle) * 0.7,
        vx: Math.sin(angle) * 10.5,
        vz: Math.cos(angle) * 10.5,
        life: 2.2,
        enemy: true,
        owner: String(e.id),
        damage: e.type === "heavy" ? 18 : 12,
      });
      e.fire = e.type === "heavy" ? 1.3 : 1.65 + random(w) * 0.45;
    }
  }
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
      effect(w, "hit", to.x, to.z);
      continue;
    }
    let hit = false;
    if (b.enemy) {
      for (const p of alive)
        if (segmentDistance(from, to, p) < 0.49) {
          hit = true;
          if (!p.invulnerable) {
            let damage = b.damage;
            const absorbed = Math.min(p.shield, damage);
            p.shield -= absorbed;
            damage -= absorbed;
            p.health = Math.max(0, p.health - damage);
            p.hurt = 4.5;
            effect(w, "hit", p.x, p.z);
            if (p.health === 0 && w.core.carrier === p.id) {
              w.core.carrier = null;
              w.core.x = p.x;
              w.core.z = p.z;
            }
          }
          break;
        }
    } else {
      for (const e of w.enemies)
        if (
          e.hp > 0 &&
          segmentDistance(from, to, e) < (e.type === "heavy" ? 0.68 : 0.55)
        ) {
          e.hp -= b.damage;
          e.hurt = 0.15;
          hit = true;
          effect(w, e.hp <= 0 ? "explosion" : "hit", e.x, e.z);
          if (e.hp <= 0) {
            w.kills++;
            const owner = w.players.find((p) => p.id === b.owner);
            if (owner) owner.kills++;
          }
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
    if (distance(carrier, EXTRACTION) < 2.7) {
      w.extraction += dt;
      if (w.extraction >= 2) {
        w.status = "won";
        w.reason = "Core secured. The whole crew gets a cut.";
      }
    } else w.extraction = Math.max(0, w.extraction - dt * 2);
  } else w.extraction = 0;
}
export function frame(w: World): World {
  // Navigation routes are host-only. Guests need just the visible state.
  return structuredClone({
    ...w,
    enemies: w.enemies.map((e) => ({ ...e, path: [] })),
  });
}
