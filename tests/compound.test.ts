import test from "node:test";
import assert from "node:assert/strict";
import { BOUNDS, CORE, EXTRACTION, PICKUPS, RELAYS, SPAWNS, blocked, distance, findPath, slideMove, walkableLine } from "../src/game/map.ts";
import { createWorld, frame, stepWorld } from "../src/game/simulation.ts";
import { ENEMIES, ENEMY_TYPES } from "../src/game/enemies.ts";
import { allyInput } from "../src/game/ai.ts";
import { EMPTY_INPUT, type Enemy } from "../src/game/types.ts";
import { validWorld } from "../src/game/validate.ts";
import { MemoryStorage } from "../server/storage.ts";
import { roomRequest } from "../server/rooms.ts";

const human = { id: "human", name: "Rook", color: 0 };
function enemy(type: Enemy["type"], x: number, z: number): Enemy { return { id: 900, type, x, z, hp: ENEMIES[type].hp, maxHp: ENEMIES[type].hp, angle: 0, fire: 0, path: [], pathTime: 0, hurt: 0 }; }

test("the four-times-larger compound has navigable routes between spawn, every relay, the vault and extraction", () => {
  assert.equal(BOUNDS.x * BOUNDS.z * 4, 8000);
  assert.equal(PICKUPS.length, 6);
  const targets = [...RELAYS, EXTRACTION, CORE];
  for (const start of [...SPAWNS, ...RELAYS]) for (const end of targets) {
    const open = end === CORE;
    const path = findPath(start, end, open);
    assert.ok(path.length > 0, JSON.stringify({ start, end }));
    let previous = start;
    for (const waypoint of path) {
      assert.ok(!blocked(waypoint.x, waypoint.z, .48, open));
      assert.ok(walkableLine(previous, waypoint, open), "navigation edges must not clip corners or walls");
      previous = waypoint;
    }
    assert.ok(distance(previous, end) < .01);
  }
  const walker = { ...SPAWNS[0] };
  const route = findPath(walker, RELAYS[0], false);
  for (const target of route) for (let i = 0; i < 250 && distance(walker, target) > .08; i++) {
    const d = distance(walker, target); slideMove(walker, (target.x-walker.x)/d*.07, (target.z-walker.z)/d*.07, .42, false);
  }
  assert.ok(distance(walker, RELAYS[0]) < .1, "a character can actually walk the route");
});

test("security spawns all seven classes, including four armed humanoid types", () => {
  const w = createWorld([human], 137, "casual"); w.time = 45; w.strikeTimer = 999; w.players[0].invulnerable = 999;
  const seen = new Set<string>();
  for (let i = 0; i < 160; i++) { w.spawnTimer = 0; stepWorld(w, {}, .1); w.enemies.forEach(e => { seen.add(e.type); assert.ok(!blocked(e.x,e.z,.46,false)); }); w.enemies = []; }
  assert.deepEqual([...seen].sort(), [...ENEMY_TYPES].sort());
  assert.equal(ENEMY_TYPES.filter(t => ENEMIES[t].humanoid).length, 4);
  assert.ok(validWorld(frame(w), [human.id]));
});

test("humanoid marksmen hold distance while breachers close, and their weapons have different patterns", () => {
  const marksman = createWorld([human], 20), breacher = createWorld([human], 20);
  for (const w of [marksman, breacher]) { Object.assign(w.players[0], { x:-35, z:35, invulnerable:999 }); w.spawnTimer=w.strikeTimer=999; }
  marksman.enemies = [enemy("marksman", -35, 20)]; breacher.enemies = [enemy("raider", -35, 20)];
  stepWorld(marksman, {}, .1); stepWorld(breacher, {}, .1);
  assert.ok(breacher.enemies[0].z > marksman.enemies[0].z + .1);
  assert.equal(marksman.bullets.filter(b => b.enemy).length, 1);
  assert.equal(breacher.bullets.filter(b => b.enemy).length, 5);
  assert.ok(marksman.bullets[0].vz > breacher.bullets[2].vz);
});

test("humanoid AI squadmates follow, shoot, revive a human, and leave the core to the human crew", () => {
  const w = createWorld([human], 55, "casual", 1), [p, bot] = w.players;
  w.spawnTimer = w.strikeTimer = 999;
  Object.assign(p, { x:-40, z:35, invulnerable:999 }); Object.assign(bot, { x:-46, z:35, invulnerable:999 });
  const start = distance(p,bot);
  for (let i=0;i<90;i++) stepWorld(w,{},1/60);
  assert.ok(distance(p,bot) < start-2);
  w.enemies = [enemy("guard", -34,35)];
  let fired = false;
  for (let i=0;i<180;i++) { stepWorld(w,{},1/60); if(w.bullets.some(b=>b.owner===bot.id))fired=true; }
  assert.ok(fired); assert.ok(bot.kills > 0, "ally fire causes authoritative enemy damage");
  w.enemies=[]; p.health=0; Object.assign(bot,{x:p.x+1,z:p.z});
  for (let i=0;i<140;i++) stepWorld(w,{},1/60);
  assert.equal(p.health,55); assert.equal(w.status,"playing");
  w.relays.forEach(r=>r.done=true); w.core.x=bot.x;w.core.z=bot.z;
  for (let i=0;i<60;i++) stepWorld(w,{},1/60);
  assert.equal(w.core.carrier,null);
  assert.ok(validWorld(frame(w),[human.id]));
});

test("AI teammates move out of marked strikes and cannot impersonate authenticated human seats", () => {
  const w = createWorld([human], 5,"casual",2), bot=w.players[1];
  w.hazards=[{id:88,x:bot.x,z:bot.z,born:0,delay:1.9,radius:1.7,hit:false}];
  const input=allyInput(w,bot,false);
  assert.ok(Math.hypot(input.mx,input.mz)>.9);
  assert.ok(validWorld(frame(w),[human.id]));
  const forged=frame(w);forged.players[1].id=human.id;
  assert.equal(validWorld(forged,[human.id]),false);
  forged.players[1].id="unregistered-human";forged.players[1].isBot=false;
  assert.equal(validWorld(forged,[human.id]),false);
});

test("the host configures AI backup and real joiners replace AI slots without exceeding four crew", async () => {
  const store=new MemoryStorage(), lead=await roomRequest({type:"create",name:"Lead",bots:3},"","h",store);
  assert.equal(lead.room.bots,3);
  const a=await roomRequest({type:"join",code:lead.room.code,name:"One"},"","g1",store);
  assert.equal(a.room.bots,2);
  await assert.rejects(()=>roomRequest({type:"bots",code:lead.room.code,bots:0},a.token!,"g1",store),e=>(e as any).status===403);
  const b=await roomRequest({type:"join",code:lead.room.code,name:"Two"},"","g2",store);
  assert.equal(b.room.bots,1);
  await assert.rejects(()=>roomRequest({type:"bots",code:lead.room.code,bots:3},lead.token!,"h",store));
  const w=createWorld(b.room.players,10,b.room.difficulty,b.room.bots);
  assert.equal(w.players.length,4);assert.equal(w.players.filter(p=>p.isBot).length,1);
  assert.ok(validWorld(frame(w),b.room.players.map(p=>p.id)));
});
