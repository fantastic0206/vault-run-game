import test from "node:test";
import assert from "node:assert/strict";
import { stickVector, TouchPointers } from "../src/game/touch.ts";
import { Controls } from "../src/game/controls.ts";
import { createWorld } from "../src/game/simulation.ts";
import type { Battlefield } from "../src/game/scene.ts";

test("a centered finger stays neutral at every responsive joystick size", () => {
  for (const size of [84, 90, 96, 108, 116]) {
    const rect={left:24,top:210,width:size,height:size};
    assert.deepEqual(stickVector(rect,24+size/2,210+size/2),{x:0,y:0,offsetX:0,offsetY:0});
  }
});

test("responsive thumb travel is normalized, reaches full movement, and stays inside the ring", () => {
  for (const size of [84, 90, 96, 108, 116]) for (const [dx,dy] of [[100,0],[0,-100],[-100,100],[1000,-1000]]) {
    const rect={left:15,top:180,width:size,height:size};
    const v=stickVector(rect,15+size/2+dx,180+size/2+dy);
    assert.ok(Math.abs(Math.hypot(v.x,v.y)-1)<1e-8);
    assert.ok(Math.hypot(v.offsetX,v.offsetY)+size*.2 < size/2,"thumb stays inside the actual rendered circle");
    assert.equal(Math.sign(v.x),Math.sign(dx));assert.equal(Math.sign(v.y),Math.sign(dy));
  }
});

test("small joystick movements remain proportional when a phone rotates", () => {
  for(const size of [84,116]) {
    const rect={left:0,top:0,width:size,height:size}, travel=size*.3-4;
    const v=stickVector(rect,size/2+travel*.4,size/2);
    assert.ok(Math.abs(v.x-.4)<1e-8);assert.equal(v.y,0);
  }
});

test("independent fingers retain their own actions and cancellation releases ownership", () => {
  const pointers=new TouchPointers();
  assert.equal(pointers.claim("interact",11),true);
  assert.equal(pointers.claim("dash",12),true);
  assert.equal(pointers.claim("interact",13),false);
  assert.equal(pointers.claim("reload",11),false,"a captured finger cannot start another action");
  assert.equal(pointers.release("interact",12),false,"lifting another finger does not cancel ACT");
  assert.equal(pointers.release("dash",12),true);
  assert.equal(pointers.release("interact",11),true);
  pointers.claim("reload",13);pointers.clear();
  assert.equal(pointers.claim("reload",14),true,"rotation/unmount reset allows a fresh gesture");
});

test("simultaneous movement and aim work through Controls and resetting stops movement and firing", () => {
  const old=Object.getOwnPropertyDescriptor(globalThis,"window");
  Object.defineProperty(globalThis,"window",{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
  const controls=new Controls({addEventListener(){},removeEventListener(){}} as unknown as HTMLCanvasElement,{} as Battlefield);
  try {
    controls.enabled=true;
    const move=stickVector({left:0,top:0,width:84,height:84},84,42);
    const aim=stickVector({left:200,top:0,width:116,height:116},258,0);
    controls.stick("move",move.x,move.y);controls.stick("aim",aim.x,aim.y);
    controls.action("interact",true);
    const p=createWorld([{id:"solo",name:"Rook",color:0}]).players[0];
    const input=controls.read(p);
    assert.ok(Math.hypot(input.mx,input.mz)>.99);assert.equal(input.shoot,true);assert.equal(input.interact,true);
    controls.reset();const stopped=controls.read(p);
    assert.equal(stopped.mx,0);assert.equal(stopped.mz,0);assert.equal(stopped.shoot,false);assert.equal(stopped.interact,false);
  } finally {controls.dispose();if(old)Object.defineProperty(globalThis,"window",old);else Reflect.deleteProperty(globalThis,"window");}
});
