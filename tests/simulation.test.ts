import test from "node:test";
import assert from "node:assert/strict";
import { EXTRACT_SECONDS, HACK_SECONDS } from "../src/game/balance.ts";
import {
  createWorld,
  frame,
  interactionHint,
  MAGAZINE,
  stepWorld,
  vaultOpen,
} from "../src/game/simulation.ts";
import {
  blocked,
  BOUNDS,
  clearShot,
  CORE,
  distance,
  EXTRACTION,
  findPath,
  OBSTACLES,
  RELAYS,
  segmentDistance,
  slideMove,
} from "../src/game/map.ts";
import { screenToWorld } from "../src/game/controls.ts";
import { sanitizeInput, validWorld } from "../src/game/validate.ts";
import { EMPTY_INPUT, type Input, type World } from "../src/game/types.ts";

const seats = [
  { id: "p1", name: "Rook", color: 0 },
  { id: "p2", name: "Ghost", color: 1 },
];
function world(count = 1) {
  const w = createWorld(seats.slice(0, count), 5347, "tactical");
  w.enemies = [];
  w.strikeTimer = 999;
  w.spawnTimer = 999;
  return w;
}
function tick(
  w: World,
  seconds: number,
  input: Partial<Input> = {},
  id = "p1",
) {
  for (let t = 0; t < seconds - 1e-8; t += 0.05)
    stepWorld(
      w,
      { [id]: { ...EMPTY_INPUT, ...input } },
      Math.min(0.05, seconds - t),
    );
}
function safe(w: World) {
  for (const p of w.players) p.invulnerable = 999;
  w.spawnTimer = 999;
}

test("one to four operatives spawn with complete, serializable state", () => {
  const w = world(2);
  assert.equal(w.players.length, 2);
  assert.equal(w.players[0].health, 100);
  assert.equal(w.players[0].shield, 50);
  assert.equal(w.relays.length, 3);
  assert.ok(
    validWorld(
      frame(w),
      seats.map((s) => s.id),
    ),
  );
  assert.throws(() => createWorld([]));
  assert.throws(() =>
    createWorld(
      Array.from({ length: 5 }, (_, i) => ({ ...seats[0], id: String(i) })),
    ),
  );
});
test("movement is bounded, diagonal input normalized, and dash cannot tunnel through cover", () => {
  const straight = world(),
    diagonal = world();
  straight.players[0].x = -17;
  straight.players[0].z = 15;
  diagonal.players[0].x = -17;
  diagonal.players[0].z = 15;
  tick(straight, 0.5, { mx: 1 });
  tick(diagonal, 0.5, { mx: 1, mz: -1 });
  assert.ok(
    Math.abs(
      distance(straight.players[0], { x: -17, z: 15 }) -
        distance(diagonal.players[0], { x: -17, z: 15 }),
    ) < 0.01,
  );
  const p = { x: -16, z: 5 };
  slideMove(p, 15, 0, 0.42, false);
  assert.ok(p.x < -14.3);
  assert.ok(!blocked(p.x, p.z, 0.42, false));
  slideMove(p, -1000, 1000, 0.42, false);
  assert.ok(Math.abs(p.x) <= BOUNDS.x - .42 && Math.abs(p.z) <= BOUNDS.z - .42);
});
test("WASD direction follows the angled camera and line/box collision is continuous", () => {
  const up = screenToWorld(0, -1);
  assert.ok(up.x < 0 && up.z < 0);
  assert.ok(Math.abs(Math.hypot(up.x, up.z) - 1) < 0.01);
  assert.ok(!clearShot({ x: 0, z: 12 }, { x: 0, z: 1 }, false));
  assert.ok(
    segmentDistance({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 5, z: 0.2 }) < 0.21,
  );
  assert.equal(clearShot({ x: 0, z: -7 }, { x: 0, z: -14 }, false), false);
  assert.equal(clearShot({ x: 0, z: -7 }, { x: 0, z: -14 }, true), true);
});
test("shooting consumes the magazine, automatic reload restores it, and reserve ammo is unlimited", () => {
  const w = world();
  for (let i = 0; i < 400 && w.players[0].ammo > 0; i++)
    tick(w, 0.05, { shoot: true, ax: 1, az: 0 });
  tick(w, 0.05);
  assert.equal(w.players[0].ammo, 0);
  assert.ok(w.players[0].reload > 0);
  tick(w, 1.5);
  assert.equal(w.players[0].ammo, MAGAZINE);
  assert.equal(w.players[0].reload, 0);
  tick(w, 0.05, { shoot: true, ax: 1, az: 0 });
  assert.equal(w.players[0].ammo, MAGAZINE - 1);
  tick(w, 1.3, { reload: true });
  assert.equal(w.players[0].ammo, MAGAZINE);
});
test("projectiles destroy drones, record their owner, and cannot shoot through crates", () => {
  const w = world();
  Object.assign(w.players[0], { x: 0, z: 14 });
  w.enemies = [
    {
      id: 500,
      x: 0,
      z: 10,
      angle: 0,
      hp: 36,
      type: "drone",
      fire: 999,
      path: [],
      pathTime: 99,
      hurt: 0,
    },
  ];
  tick(w, 0.7, { shoot: true, ax: 0, az: -1 });
  assert.equal(w.enemies.length, 0);
  assert.equal(w.kills, 1);
  assert.equal(w.players[0].kills, 1);
  const cover = world();
  Object.assign(cover.players[0], { x: 0, z: 10 });
  cover.enemies = [
    {
      id: 500,
      x: 0,
      z: 2,
      angle: 0,
      hp: 36,
      type: "drone",
      fire: 999,
      path: [],
      pathTime: 99,
      hurt: 0,
    },
  ];
  tick(cover, 0.6, { shoot: true, ax: 0, az: -1 });
  assert.equal(cover.enemies[0].hp, 36);
});
test("damage drains shields first, shields regenerate, and a fresh dash prevents damage", () => {
  const w = world(),
    p = w.players[0];
  p.invulnerable = 0;
  w.bullets.push({
    id: 101,
    x: p.x,
    z: p.z,
    vx: 0,
    vz: 0,
    life: 1,
    enemy: true,
    owner: "drone",
    damage: 12,
  });
  tick(w, 0.05);
  assert.equal(p.health, 100);
  assert.equal(p.shield, 38);
  tick(w, 5.5);
  assert.ok(p.shield > 38);
  p.invulnerable = 0;
  p.dashCooldown = 0;
  stepWorld(w, { p1: { ...EMPTY_INPUT, mx: 1, dash: 1 } }, 0.05);
  assert.ok(p.invulnerable > 0);
  assert.ok(p.dashCooldown > 2);
  const shield = p.shield;
  w.bullets.push({
    id: 102,
    x: p.x,
    z: p.z,
    vx: 0,
    vz: 0,
    life: 1,
    enemy: true,
    owner: "drone",
    damage: 12,
  });
  tick(w, 0.05, { mx: 0, dash: 1 });
  assert.ok(p.shield >= shield);
});
test("relays need proximity and sustained interaction; all three open the vault", () => {
  const w = world();
  safe(w);
  tick(w, 2, { interact: true });
  assert.equal(w.relays[0].progress, 0);
  Object.assign(w.players[0], { x: CORE.x, z: CORE.z });
  tick(w, 0.05, { interact: true });
  assert.equal(w.core.carrier, null);
  for (let i = 0; i < 3; i++) {
    Object.assign(w.players[0], { x: RELAYS[i].x, z: RELAYS[i].z + 1 });
    assert.equal(interactionHint(w, "p1")?.key, "E");
    tick(w, HACK_SECONDS(w.difficulty) + .1, { interact: true });
    w.enemies = [];
  }
  assert.ok(vaultOpen(w));
  assert.ok(w.relays.every((r) => r.done));
});
test("a full mission can hack, collect the core, extract, and stop in a terminal win state", () => {
  const w = world(2);
  safe(w);
  for (let i = 0; i < 3; i++) {
    Object.assign(w.players[0], { x: RELAYS[i].x, z: RELAYS[i].z + 1 });
    tick(w, HACK_SECONDS(w.difficulty) + .1, { interact: true });
    w.enemies = [];
  }
  Object.assign(w.players[0], CORE);
  tick(w, 0.05, { interact: true });
  assert.equal(w.core.carrier, "p1");
  Object.assign(w.players[0], EXTRACTION);
  w.enemies = [];
  tick(w, EXTRACT_SECONDS(w.difficulty) + .1);
  assert.equal(w.status, "won");
  assert.ok(w.reason.includes("Core secured"));
  const time = w.time;
  tick(w, 3);
  assert.equal(w.time, time);
});
test("dropping the core on being downed allows a teammate to pick it up", () => {
  const w = world(2),
    p = w.players[0];
  w.relays.forEach((r) => (r.done = true));
  p.invulnerable = 0;
  p.health = 1;
  p.shield = 0;
  w.core.carrier = p.id;
  w.bullets.push({
    id: 104,
    x: p.x,
    z: p.z,
    vx: 0,
    vz: 0,
    life: 1,
    enemy: true,
    owner: "drone",
    damage: 12,
  });
  tick(w, 0.05);
  assert.equal(p.health, 0);
  assert.equal(w.core.carrier, null);
  assert.equal(w.core.x, p.x);
  // Move the surviving operative close to the dropped core, beyond revive range of the body.
  w.players[1].x = p.x + 2.15;
  w.players[1].z = p.z;
  tick(w, 0.05, { interact: true }, "p2");
  assert.equal(w.core.carrier, "p2");
});
test("co-op revives require a nearby, living teammate; a team wipe and lockdown both lose", () => {
  const w = world(2);
  safe(w);
  w.players[0].health = 0;
  w.players[1].x = w.players[0].x + 1;
  w.players[1].z = w.players[0].z;
  tick(w, 2.1, { interact: true }, "p2");
  assert.equal(w.players[0].health, 55);
  assert.ok(w.players[0].invulnerable > 0);
  w.players.forEach((p) => (p.health = 0));
  tick(w, 0.05);
  assert.equal(w.status, "lost");
  const timeout = world();
  timeout.time = 239.99;
  tick(timeout, 0.05);
  assert.equal(timeout.status, "lost");
  assert.ok(timeout.reason.includes("Lockdown"));
});
test("medkits heal, disappear, and respawn", () => {
  const w = world(),
    p = w.players[0];
  p.health = 50;
  p.invulnerable = 999;
  Object.assign(p, { x: w.pickups[0].x, z: w.pickups[0].z });
  tick(w, 0.05);
  assert.equal(p.health, 90);
  assert.equal(w.pickups[0].active, false);
  p.x = -17;
  p.z = 15;
  tick(w, 55.2);
  assert.equal(w.pickups[0].active, true);
});
test("pathfinding routes drones around cover without entering solid cells", () => {
  const path = findPath({ x: -17, z: 5 }, { x: -8, z: 5 }, false);
  assert.ok(path.length > 0);
  assert.ok(path.every((p) => !blocked(p.x, p.z, 0.48, false)));
  assert.ok(distance(path.at(-1)!, { x: -8, z: 5 }) < 3);
});
test("host checkpoints clone state without leaking navigation routes", () => {
  const w = world();
  w.enemies.push({
    id: 500,
    x: 0,
    z: 0,
    angle: 0,
    hp: 36,
    type: "drone",
    fire: 1,
    path: [{ x: 1, z: 1 }],
    pathTime: 1,
    hurt: 0,
  });
  const snapshot = frame(w);
  assert.deepEqual(snapshot.enemies[0].path, []);
  snapshot.players[0].health = 0;
  assert.equal(w.players[0].health, 100);
  assert.equal(w.enemies[0].path.length, 1);
});
test("simulation remains finite and bounded during a sustained action sequence", () => {
  const w = world(2);
  safe(w);
  for (let i = 0; i < 1800; i++) {
    stepWorld(
      w,
      {
        p1: {
          ...EMPTY_INPUT,
          mx: Math.sin(i / 45),
          mz: Math.cos(i / 45),
          ax: Math.sin(i / 30),
          az: Math.cos(i / 30),
          shoot: true,
          dash: Math.floor(i / 180),
        },
      },
      1 / 30,
    );
    assert.ok(validWorld(frame(w), ["p1", "p2"]), `frame ${i}`);
    for (const p of w.players)
      assert.ok(Math.abs(p.x) <= BOUNDS.x && Math.abs(p.z) <= BOUNDS.z);
  }
});
test("network inputs reject non-finite coordinates and clamp movement", () => {
  assert.equal(sanitizeInput({ ...EMPTY_INPUT, mx: NaN }), null);
  assert.equal(sanitizeInput({}), null);
  const input = sanitizeInput({
    ...EMPTY_INPUT,
    mx: 100,
    az: -200,
    shoot: "true",
  })!;
  assert.equal(input.mx, 1);
  assert.equal(input.az, -1);
  assert.equal(input.shoot, false);
  const w = world();
  assert.ok(validWorld(w, ["p1"]));
  assert.equal(
    validWorld({ ...w, bullets: Array(201).fill({}) }, ["p1"]),
    false,
  );
});
