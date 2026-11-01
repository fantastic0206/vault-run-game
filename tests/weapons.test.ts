import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, stepWorld } from "../src/game/simulation.ts";
import { WEAPONS, DEFAULT_WEAPON, type WeaponId } from "../src/game/weapons.ts";
import { EMPTY_INPUT, type Input, type World, type Enemy } from "../src/game/types.ts";
import { validWorld } from "../src/game/validate.ts";

function arena() {
  const w=createWorld([{id:"p",name:"Rook",color:0}]);
  w.enemies=[];w.spawnTimer=w.strikeTimer=999;Object.assign(w.players[0],{x:0,z:14});return w;
}
function tick(w:World,seconds:number,input:Partial<Input>={}) {
  for(let t=0;t<seconds-1e-7;t+=.025)stepWorld(w,{p:{...EMPTY_INPUT,ax:1,az:0,...input}},Math.min(.025,seconds-t));
}
function enemy(id:number,x:number,z:number,hp:number):Enemy {return {id,x,z,hp,angle:0,type:"heavy",fire:999,path:[],pathTime:999,hurt:0};}

test("every operative starts with the strongest Nova and four loaded, unlocked guns",()=>{
  const w=arena(),p=w.players[0];
  assert.equal(DEFAULT_WEAPON,3);assert.equal(p.weapon,3);assert.equal(p.ammo,12);
  assert.deepEqual(p.magazines,WEAPONS.map(g=>g.magazine));
  assert.ok(WEAPONS[3].damage>Math.max(...WEAPONS.slice(0,3).map(g=>g.damage)));
});
test("each gun fires its advertised projectile pattern and consumes one round per trigger",()=>{
  for(let i=0;i<WEAPONS.length;i++) {
    const w=arena(),p=w.players[0],weapon=i as WeaponId;
    tick(w,.2,{weapon});tick(w,.025,{shoot:true,weapon});
    assert.equal(w.bullets.length,WEAPONS[i].pellets);
    assert.equal(p.ammo,WEAPONS[i].magazine-1);
    assert.ok(w.bullets.every(b=>b.damage===WEAPONS[i].damage&&b.weapon===i));
    assert.ok(validWorld(w,["p"]));
  }
});
test("Nova destroys a fully armored target and nearby enemies without friendly fire or double-counted kills",()=>{
  const w=arena();w.enemies=[enemy(800,4,14,215),enemy(801,5.4,14,70)];
  tick(w,.22,{shoot:true});
  assert.equal(w.enemies.length,0);assert.equal(w.kills,2);assert.equal(w.players[0].kills,2);
  assert.equal(w.players[0].health,100);assert.ok(w.effects.some(e=>e.kind==="nova"));
});
test("switching preserves each magazine and reloading uses the selected gun's capacity",()=>{
  const w=arena(),p=w.players[0];tick(w,.025,{shoot:true});assert.equal(p.ammo,11);
  tick(w,.4,{weapon:0});tick(w,.025,{shoot:true});assert.equal(p.ammo,23);
  tick(w,.2,{weapon:3});assert.equal(p.ammo,11);
  tick(w,1.1,{reload:true});assert.equal(p.ammo,12);
  tick(w,.2,{weapon:0});assert.equal(p.ammo,23);
  tick(w,1,{reload:true});assert.equal(p.ammo,24);
});
test("the minigun provides sustained fire and the shotgun has a real spread",()=>{
  const w=arena();tick(w,.2,{weapon:2});tick(w,.6,{weapon:2,shoot:true});assert.ok(w.players[0].ammo<=82);
  const shotgun=arena();tick(shotgun,.2,{weapon:1});tick(shotgun,.025,{shoot:true});
  assert.ok(new Set(shotgun.bullets.map(b=>b.vz.toFixed(2))).size>=5);
});
