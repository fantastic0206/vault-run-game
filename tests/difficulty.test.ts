import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, frame, interactionHint, stepWorld } from "../src/game/simulation.ts";
import { DIFFICULTIES, EXTRACT_SECONDS, HACK_SECONDS } from "../src/game/balance.ts";
import { EXTRACTION, RELAYS } from "../src/game/map.ts";
import { EMPTY_INPUT, type Difficulty, type Input, type World } from "../src/game/types.ts";
import { validWorld } from "../src/game/validate.ts";

const seats=["Rook","Ghost","Cipher","Ember"].map((name,i)=>({id:"p"+i,name,color:i}));
function clean(difficulty: Difficulty="lockdown") {
  const w=createWorld(seats.slice(0,1),42,difficulty);
  w.enemies=[];w.spawnTimer=999;w.strikeTimer=999;w.players[0].invulnerable=0;
  return w;
}
function run(w:World,seconds:number,input:Partial<Input>={}) {
  for(let t=0;t<seconds-1e-6;t+=.05) stepWorld(w,{p0:{...EMPTY_INPUT,...input}},Math.min(.05,seconds-t));
}
test("default Lockdown begins with security and scales guards and armor for a full crew",()=>{
  const solo=createWorld(seats.slice(0,1),100),crew=createWorld(seats,100),easy=createWorld(seats.slice(0,1),100,"tactical"),hard=createWorld(seats.slice(0,1),100,"nightmare");
  assert.equal(solo.difficulty,"lockdown");
  assert.ok(solo.enemies.length>=4);
  assert.ok(crew.enemies.length>solo.enemies.length);
  assert.ok(crew.enemies[0].hp>solo.enemies[0].hp);
  assert.ok(hard.enemies.length>easy.enemies.length);
  assert.ok(HACK_SECONDS("lockdown")>HACK_SECONDS("tactical"));
});
test("security strikes warn first, hit once, and can be dodged",()=>{
  const w=clean(),p=w.players[0];
  w.hazards=[{id:999,x:p.x,z:p.z,born:0,delay:1.25,radius:2.15,hit:false}];
  run(w,1.2);assert.equal(p.shield,50);
  run(w,.1);const shield=p.shield;assert.ok(shield<50);
  run(w,.3);assert.equal(p.shield,shield);
  const dodge=clean(),q=dodge.players[0];
  dodge.hazards=[{id:999,x:q.x,z:q.z,born:0,delay:1.25,radius:2.15,hit:false}];
  run(dodge,1.5,{mx:1});assert.equal(q.shield,50);assert.equal(q.health,100);
});
test("hacking needs stillness and a clear perimeter, and abandoned progress decays",()=>{
  const w=clean(),p=w.players[0];Object.assign(p,{x:RELAYS[0].x,z:RELAYS[0].z+1});
  run(w,1,{interact:true});const progress=w.relays[0].progress;assert.ok(progress>.9);
  run(w,.5,{interact:true,mx:1});assert.ok(w.relays[0].progress<progress);assert.equal(w.relays[0].done,false);
  Object.assign(p,{x:RELAYS[0].x,z:RELAYS[0].z+1});w.relays[0].progress=0;
  w.enemies=[{id:100,x:RELAYS[0].x+1,z:RELAYS[0].z,angle:0,hp:50,type:"drone",fire:999,path:[],pathTime:999,hurt:0}];
  assert.match(interactionHint(w,p.id)!.text,/CLEAR/);
  run(w,.5,{interact:true});assert.equal(w.relays[0].progress,0);
  w.enemies=[];run(w,HACK_SECONDS(w.difficulty)+.1,{interact:true});assert.equal(w.relays[0].done,true);
});
test("extraction cannot be rushed through nearby security; clearing it permits a full defend phase",()=>{
  const w=clean(),p=w.players[0];w.relays.forEach(r=>r.done=true);w.core.carrier=p.id;Object.assign(p,EXTRACTION);
  w.enemies=[{id:100,x:EXTRACTION.x+2,z:EXTRACTION.z,angle:0,hp:50,type:"heavy",fire:999,path:[],pathTime:999,hurt:0}];
  run(w,.2);assert.equal(w.extraction,0);assert.match(interactionHint(w,p.id)!.text,/CLEAR/);
  w.enemies=[];p.invulnerable=999;run(w,2.1);assert.equal(w.status,"playing");
  run(w,EXTRACT_SECONDS(w.difficulty));assert.equal(w.status,"won");
});
test("standing still without fighting or dodging is a losing strategy on the default difficulty",()=>{
  for(const seed of [4,17,97]) {
    const w=createWorld(seats.slice(0,1),seed);
    run(w,60);
    assert.equal(w.status,"lost");assert.ok(w.time<60);
  }
});
test("the complete threat simulation stays valid for every difficulty and a four-player crew",()=>{
  for(const difficulty of Object.keys(DIFFICULTIES) as Difficulty[]) {
    const w=createWorld(seats,83,difficulty);w.players.forEach(p=>p.invulnerable=999);
    for(let n=0;n<900;n++) {
      stepWorld(w,Object.fromEntries(seats.map((p,i)=>[p.id,{...EMPTY_INPUT,mx:Math.sin(n/80+i),mz:Math.cos(n/80+i),ax:Math.sin(n/20),az:Math.cos(n/20),shoot:true,dash:Math.floor(n/80)}])),.05);
      assert.ok(validWorld(frame(w),seats.map(p=>p.id)),difficulty+" at frame "+n);
    }
    assert.ok(w.hazards.length>=0);assert.ok(w.enemies.length<=22);
  }
});
