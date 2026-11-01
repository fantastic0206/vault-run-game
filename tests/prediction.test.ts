import test from "node:test";
import assert from "node:assert/strict";
import { Runtime } from "../src/game/runtime.ts";
import { LocalPrediction, Presentation } from "../src/game/prediction.ts";
import { STEP, WALK_SPEED } from "../src/game/player.ts";
import { createWorld, frame, stepWorld } from "../src/game/simulation.ts";
import { blocked, distance } from "../src/game/map.ts";
import { EMPTY_INPUT, type Input, type Room, type World } from "../src/game/types.ts";
import type { Battlefield } from "../src/game/scene.ts";
import type { Controls } from "../src/game/controls.ts";

const seats = [{ id: "lead", name: "Rook", color: 0, online: true }, { id: "guest", name: "Ghost", color: 1, online: true }];
function safeWorld() {
  const w = createWorld(seats, 22); w.spawnTimer = w.strikeTimer = 999;
  w.players.forEach((p, i) => { p.x = -44; p.z = 35 - i * 2; p.invulnerable = 999; });
  return w;
}

for (const delay of [50, 120, 250]) test(`guest responds within one tick and retains full speed with ${delay}ms one-way delay, jitter, packet loss and duplicates`, () => {
  let now = 0, moving = true, inputPackets = 0, framePackets = 0;
  let tasks: { at: number; run: () => void }[] = [];
  const faults: string[] = [];
  function client(id: string) {
    let seq = 0, reads = 0, rendered: World | undefined;
    const controls = { enabled: false, reset() {}, read() { reads++; return { ...EMPTY_INPUT, mx: moving ? 1 : 0, ax: 1, az: 0, shoot: id === "guest" && seq === 0, seq: ++seq }; }, dispose() {} };
    const view = { renderer: { setAnimationLoop() {} }, render(w: World) { rendered = w; }, dispose() {} };
    const game = new Runtime({} as HTMLCanvasElement, { autoStart: false, view: view as unknown as Battlefield, controls: controls as unknown as Controls, now: () => now });
    game.callbacks.fault = text => faults.push(text);
    const room: Room = { code: "ABC234", version: 1, gameId: "latency-raid", hostId: "lead", selfId: id, phase: "playing", difficulty: "casual", bots: 0, players: seats, result: null };
    game.coop(room, frame(safeWorld()));
    return { game, rendered: () => rendered!, reads: () => reads };
  }
  const host = client("lead"), guest = client("guest");
  const schedule = (n: number, run: () => void) => tasks.push({ at: now + delay * (1 + ((n % 5) - 2) * .12), run });
  guest.game.callbacks.input = (input, commands) => {
    const n = ++inputPackets; if (n % 7 === 0) return;
    const packet = structuredClone({ input, commands });
    schedule(n, () => host.game.remoteInput("latency-raid", "guest", packet.input, guest.game.controlStream, packet.commands));
    if (n % 9 === 0) schedule(n + 1, () => host.game.remoteInput("latency-raid", "guest", packet.input, guest.game.controlStream, packet.commands));
  };
  host.game.callbacks.frame = w => { const n = ++framePackets; if (n % 5) schedule(n, () => guest.game.remoteFrame("latency-raid", w)); };
  const step = () => {
    now += STEP * 1000;
    const ready = tasks.filter(t => t.at <= now); tasks = tasks.filter(t => t.at > now); ready.forEach(t => t.run());
    guest.game.tick(); host.game.tick(); guest.game.renderFrame(); host.game.renderFrame();
  };
  try {
    step();
    assert.equal(host.game.world.players[1].x, -44, "host has not received the first movement yet");
    assert.ok(guest.rendered().players[1].x > -43.9, "guest moves immediately before receiving an acknowledgement");
    assert.equal(guest.rendered().bullets.filter(b => b.owner === "guest").length, 1, "local muzzle/projectile is immediate");
    const bullet = guest.rendered().bullets[0];
    const reads = guest.reads(); guest.game.renderFrame(now + 8);
    assert.equal(guest.reads(), reads, "rendering never consumes another input sequence");
    assert.ok(guest.rendered().bullets[0].x > bullet.x + .2, "the predicted projectile moves between simulation ticks");
    for (let n = 1; n < 180; n++) step();
    assert.ok(Math.abs(guest.game.prediction!.player.x - (-44 + WALK_SPEED * 3)) < .04, "local speed is independent of RTT");
    moving = false;
    for (let n = 0; n < 180; n++) step();
    const authoritative = host.game.world.players[1], predicted = guest.game.prediction!.player;
    assert.ok(Math.abs(authoritative.x - host.game.world.players[0].x) < .04, "both operatives cover the same distance");
    assert.ok(distance(authoritative, predicted) < .02, "host acknowledgement and local prediction converge after release");
    assert.equal(authoritative.shots, 1, "retransmissions cannot fire a trigger twice");
    assert.equal(authoritative.lastDash, 0);
    assert.ok(guest.game.prediction!.pending.length < 64, "acknowledgements drain the command backlog at high RTT");
    assert.deepEqual(faults, []);
  } finally { host.game.dispose(); guest.game.dispose(); }
});

test("predicted dash and collision reconcile with the host and confirmed shots never render twice", () => {
  const w = safeWorld(), p = w.players[1]; p.x = -16; p.z = 5;
  const prediction = new LocalPrediction(p, "control-prediction-test"); p.inputStream = prediction.stream;
  for (let seq = 1; seq <= 30; seq++) {
    const input: Input = { ...EMPTY_INPUT, seq, mx: 1, ax: 1, az: 0, dash: 1, shoot: seq === 1 };
    prediction.advance(input, STEP, seq * STEP * 1000, w);
    stepWorld(w, {}, STEP, { guest: [{ input, dt: STEP }] });
    prediction.reconcile(w);
    assert.ok(distance(p, prediction.player) < 1e-8);
    assert.ok(!blocked(prediction.player.x, prediction.player.z, .42, false));
  }
  assert.ok(p.x < -14.3, "dash stops at the crate");
  const shots = safeWorld(), shooter = shots.players[1], local = new LocalPrediction(shooter, "control-prediction-test");
  shooter.inputStream = local.stream;
  const input = { ...EMPTY_INPUT, seq: 1, shoot: true, ax: 1, az: 0 };
  local.advance(input, STEP, 0, shots); stepWorld(shots, {}, STEP, { guest: [{ input, dt: STEP }] }); local.reconcile(shots);
  const presentation = new Presentation(); presentation.push(shots, 0);
  assert.equal(presentation.sample(20, local.player, local)!.bullets.filter(b => b.owner === "guest").length, 1);
  assert.equal(local.pending.length, 0);
});

test("remote bullets move continuously, expire through a missing snapshot, and cannot visually cross cover", () => {
  const w = safeWorld(); w.bullets = [{ id: 99, x: -35, z: 35, vx: 12, vz: 0, life: 1, enemy: true, owner: "sentry", damage: 10 }];
  const presentation = new Presentation(); presentation.push(w, 1000);
  const a = presentation.sample(1100, w.players[1])!, b = presentation.sample(1200, w.players[1])!;
  assert.ok(Math.abs(b.bullets[0].x - a.bullets[0].x - 1.2) < 1e-8);
  assert.equal(presentation.sample(2100, w.players[1])!.bullets.length, 0, "a lost connection expires bullets instead of leaving them suspended");
  w.tick++; w.bullets[0] = { ...w.bullets[0], id: 100, x: -16, z: 5, vx: 32 };
  presentation.push(w, 2200);
  assert.equal(presentation.sample(2350, w.players[1])!.bullets.length, 0, "extrapolation respects the crate");
});

test("jittered snapshots do not rewind remote actors or interrupt a projectile's flight speed", () => {
  const presentation = new Presentation(), w = safeWorld();
  w.bullets = [{ id: 80, x: -35, z: 35, vx: 12, vz: 0, life: 1, enemy: true, owner: "guard", damage: 10 }];
  presentation.push(w, 0);
  let tasks: { at: number; world: World }[] = [], previousX = -35, actorX = -44;
  for (let i = 1; i <= 36; i++) {
    const now = i * STEP * 1000;
    if (i % 3 === 0) {
      const snapshot = frame(w); snapshot.tick = i; snapshot.time = i * STEP;
      snapshot.players[1].x += WALK_SPEED * snapshot.time; snapshot.players[1].vx = WALK_SPEED;
      snapshot.bullets[0].x += 12 * snapshot.time; snapshot.bullets[0].life -= snapshot.time;
      tasks.push({ at: now + [0,40,0,60][i / 3 % 4], world: snapshot });
    }
    for (const task of tasks.filter(t => t.at <= now)) presentation.push(task.world, task.at);
    tasks = tasks.filter(t => t.at > now);
    const visual = presentation.sample(now, w.players[0])!;
    assert.ok(Math.abs(visual.bullets[0].x - previousX - 12 * STEP) < 1e-7);
    if (i > 15) {
      assert.ok(visual.players[1].x > actorX, "a later packet cannot pull a constantly moving actor backwards");
      assert.ok(visual.players[1].x - actorX < WALK_SPEED * STEP * 1.25, "packet arrivals cannot produce a speed burst");
    }
    previousX = visual.bullets[0].x; actorX = visual.players[1].x;
  }
});

test("command processing is deduplicated and bounded by elapsed host time", () => {
  let now = 0;
  const game = new Runtime({} as HTMLCanvasElement, { autoStart: false, now: () => now, controls: { enabled: false, reset() {}, read() { return { ...EMPTY_INPUT }; }, dispose() {} } as unknown as Controls, view: { renderer: { setAnimationLoop() {} }, render() {}, dispose() {} } as unknown as Battlefield });
  const room: Room = { code: "ABC234", version: 1, gameId: "rate-test", hostId: "lead", selfId: "lead", phase: "playing", difficulty: "casual", bots: 0, players: seats, result: null };
  try {
    game.coop(room, safeWorld());
    const commands = Array.from({ length: 64 }, (_, i) => ({ input: { ...EMPTY_INPUT, seq: i + 1, mx: 1 }, dt: STEP }));
    for (let n = 0; n < 8; n++) game.remoteInput("rate-test", "guest", commands.at(-1)!.input, "control-bounded-test", commands);
    now = 100; game.tick();
    const p = game.world.players[1];
    assert.ok(p.x <= -44 + WALK_SPEED * .201, "a client cannot inject seconds of future movement into a single tick");
    assert.ok(p.lastInput <= 12);
    for (let n = 0; n < 120; n++) { now += STEP * 1000; game.tick(); }
    assert.equal(p.lastInput, 64);
    assert.ok(Math.abs(p.x - (-44 + WALK_SPEED * STEP * 64)) < 1e-7, "every command moves once, even when its packet is duplicated");
  } finally { game.dispose(); }
});

test("solo pause freezes projectiles and resuming restarts their visual clock", () => {
  let now = 0, rendered: World | undefined;
  const game = new Runtime({} as HTMLCanvasElement, { autoStart: false, now: () => now, controls: { enabled: false, reset() {}, read() { return { ...EMPTY_INPUT }; }, dispose() {} } as unknown as Controls, view: { renderer: { setAnimationLoop() {} }, render(w: World) { rendered = w; }, dispose() {} } as unknown as Battlefield });
  try {
    game.solo("Rook", "casual", 0);
    game.world.bullets = [{ id: 90, x: -35, z: 35, vx: 12, vz: 0, life: 1, enemy: false, owner: "solo", damage: 28 }];
    now = STEP * 1000; game.tick(); game.renderFrame();
    const x = rendered!.bullets[0].x;
    game.pause(true); now += 3000; game.tick(); game.renderFrame();
    assert.equal(rendered!.bullets[0].x, x);
    game.pause(false); game.renderFrame(); assert.equal(rendered!.bullets.length, 1);
    now += STEP * 1000; game.tick(); game.renderFrame();
    assert.ok(Math.abs(rendered!.bullets[0].x - x - 12 * STEP) < 1e-7);
  } finally { game.dispose(); }
});
