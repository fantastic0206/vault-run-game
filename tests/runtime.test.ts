import test from "node:test";
import assert from "node:assert/strict";
import { Runtime } from "../src/game/runtime.ts";
import type { Battlefield } from "../src/game/scene.ts";
import { Controls } from "../src/game/controls.ts";
import { createWorld, frame } from "../src/game/simulation.ts";
import { EMPTY_INPUT, type Input, type Room, type World } from "../src/game/types.ts";
import { validWorld } from "../src/game/validate.ts";

const seats = ["Rook", "Ghost", "Cipher", "Ember"].map((name,i) => ({ id: "seat-"+i,name,color:i,online:true,left:false }));
function room(self=0,gameId="mission-1"): Room {
  return { code:"ABC234",version:1,gameId,hostId:seats[0].id,selfId:seats[self].id,phase:"playing",difficulty:"lockdown",players:structuredClone(seats),result:null };
}
function client() {
  let now=1000, seq=0;
  let input: Input={...EMPTY_INPUT};
  const faults: string[]=[];
  const controls={enabled:false,reset(){input={...EMPTY_INPUT};},read(){return {...(this.enabled?input:EMPTY_INPUT),seq:++seq};},dispose(){}};
  const view={renderer:{setAnimationLoop(){}},render(w:World,selfId:string){
    assert.ok(w.players.some(p=>p.id===selfId) || !game.active);
    assert.ok(validWorld(w,w.players.map(p=>p.id)));
  },dispose(){}};
  const game=new Runtime({} as HTMLCanvasElement,{autoStart:false,view:view as unknown as Battlefield,controls:controls as unknown as Controls,now:()=>now});
  game.callbacks.fault=(message)=>faults.push(message);
  return {game,controls,faults,view,set:(value:Partial<Input>)=>{input={...EMPTY_INPUT,...value};},advance:(ms=50)=>{now+=ms;},tick:()=>{game.tick();game.renderFrame();}};
}

test("four real client runtimes synchronize guest input and authoritative frames through a full combat sequence",()=>{
  const clients=seats.map(()=>client()), host=clients[0];
  try {
    clients.forEach((c,i)=>c.game.coop(room(i)));
    assert.ok(clients.slice(1).every(c=>c.game.awaitingFrame && !c.controls.enabled));
    host.game.callbacks.frame=(w)=>clients.slice(1).forEach(c=>c.game.remoteFrame("mission-1",structuredClone(w)));
    clients.slice(1).forEach((c,i)=>c.game.callbacks.input=(input)=>host.game.remoteInput("mission-1",seats[i+1].id,input,"socket-"+i));
    const starts=host.game.world.players.map(p=>p.x);
    host.set({mx:.8,shoot:true,ax:1,az:0});
    for(let n=0;n<90;n++) {
      clients.forEach(c=>c.advance());
      clients.slice(1).forEach(c=>{c.set({mx:.7,shoot:true,ax:1,az:0});c.tick();});
      host.tick();
    }
    for(const c of clients) {
      assert.deepEqual(c.faults,[]);
      assert.ok(c.game.world.tick>80);
      assert.ok(!c.game.awaitingFrame);
      assert.ok(c.game.world.players.every((p,i)=>p.x>starts[i]+3));
      assert.ok(validWorld(c.game.world,seats.map(p=>p.id)));
    }
    assert.ok(host.game.world.enemies.length>0);
  } finally {clients.forEach(c=>c.game.dispose());}
});

test("a refreshed guest resumes at sequence one and can dash without waiting for its old counter",()=>{
  const c=client();
  try {
    c.game.coop(room());
    const p=c.game.world.players[1];
    p.lastDash=9;
    c.game.remoteInput("mission-1",p.id,{...EMPTY_INPUT,mx:1,seq:4000,dash:9},"old-socket");
    c.advance();c.tick();
    const before=p.x;
    c.game.remoteInput("mission-1",p.id,{...EMPTY_INPUT,mx:-1,seq:1,dash:0},"new-socket");
    c.advance();c.tick();
    assert.ok(p.x<before,"fresh input must move immediately");
    c.game.remoteInput("mission-1",p.id,{...EMPTY_INPUT,mx:-1,seq:2,dash:1},"new-socket");
    c.advance();c.tick();
    assert.equal(p.lastDash,10);
    assert.ok(p.dashCooldown>2);
    const x=p.x;
    c.game.remoteInput("mission-1",p.id,{...EMPTY_INPUT,mx:1,seq:999999,dash:99},"old-socket");
    c.advance();c.tick();
    assert.ok(p.x<x,"retired connection must not regain control");
    assert.deepEqual(c.faults,[]);
  } finally {c.game.dispose();}
});

test("guests reject previous missions, partial frames, old builds, and wrong rosters without corrupting the renderer",()=>{
  const c=client();
  try {
    c.game.coop(room(1));
    const old=createWorld(seats,3,"lockdown");old.tick=9000;
    assert.equal(c.game.remoteFrame("mission-1",frame(old)),true);
    c.game.menu();c.game.coop(room(1,"mission-2"));
    assert.equal(c.game.remoteFrame("mission-1",old),false);
    assert.equal(c.game.world.tick,0);
    const valid=frame(createWorld(seats,4,"lockdown"));valid.tick=1;
    const bad=[null,{}, {...valid,version:1}, {...valid,players:[null]}, {...valid,players:valid.players.slice(0,1)}, {...valid,hazards:[null]}, {...valid,relays:[null,null,null]}, {...valid,players:valid.players.map(p=>({...p,x:NaN}))}];
    for(const value of bad) assert.equal(c.game.remoteFrame("mission-2",value),false);
    c.tick();
    assert.deepEqual(c.faults,[]);
    assert.equal(c.game.remoteFrame("mission-2",valid),true);
    assert.equal(c.controls.enabled,true);
    c.game.remoteFrame("mission-2",{...valid,status:"won"});
    assert.equal(c.game.remoteFrame("mission-2",{...valid,tick:2,status:"playing"}),false);
  } finally {c.game.dispose();}
});

test("a guest reconnect restores the checkpoint and a missing checkpoint waits for the host",()=>{
  const a=client(),b=client();
  try {
    const checkpoint=frame(createWorld(seats,9,"lockdown"));checkpoint.tick=300;checkpoint.time=5;
    a.game.coop(room(2),checkpoint);
    assert.equal(a.game.world.tick,300);
    assert.equal(a.game.awaitingFrame,false);
    b.game.coop(room(3),{players:[null]} as unknown as World);
    assert.equal(b.game.awaitingFrame,true);
    b.tick();
    assert.equal(b.game.remoteFrame("mission-1",checkpoint),true);
    assert.equal(b.game.awaitingFrame,false);
    assert.deepEqual([...a.faults,...b.faults],[]);
  } finally {a.game.dispose();b.game.dispose();}
});

test("a rendering exception stops safely and exposes a recovery action instead of repeating the crash",()=>{
  const c=client();
  try {
    c.game.coop(room(1));
    c.view.render=()=>{throw new Error("Device context lost");};
    c.game.renderFrame();c.game.renderFrame();c.game.tick();
    assert.equal(c.faults.length,1);
    assert.equal(c.controls.enabled,false);
  } finally {c.game.dispose();}
});

test("denied gamepad permissions leave mouse, keyboard and touch input available",()=>{
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,"window"),oldNavigator=Object.getOwnPropertyDescriptor(globalThis,"navigator");
  try {
    Object.defineProperty(globalThis,"window",{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
    Object.defineProperty(globalThis,"navigator",{configurable:true,value:{getGamepads(){throw new Error("Permissions policy blocks gamepad");}}});
    const controls=new Controls({addEventListener(){},removeEventListener(){}} as unknown as HTMLCanvasElement,{} as Battlefield);
    controls.enabled=true;
    controls.stick("move",1,0);
    const input=controls.read(createWorld(seats).players[0]);
    assert.ok(Math.hypot(input.mx,input.mz)>.9);
    controls.dispose();
  } finally {
    if(oldWindow)Object.defineProperty(globalThis,"window",oldWindow);else Reflect.deleteProperty(globalThis,"window");
    if(oldNavigator)Object.defineProperty(globalThis,"navigator",oldNavigator);else Reflect.deleteProperty(globalThis,"navigator");
  }
});
