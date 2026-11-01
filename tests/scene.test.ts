import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Battlefield } from "../src/game/scene.ts";
import { createWorld } from "../src/game/simulation.ts";
import { BOUNDS } from "../src/game/map.ts";
import { ENEMIES, ENEMY_TYPES } from "../src/game/enemies.ts";
import { EMPTY_INPUT } from "../src/game/types.ts";
import { WEAPONS } from "../src/game/weapons.ts";

test("actual Three.js level and actor geometry render all classes, AI and weapons without GPU, and clear correctly between missions", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "document");
  const gradient = { addColorStop() {} };
  const context = new Proxy<Record<string, unknown>>({}, { get(target, key: string) { return target[key] ?? (key.startsWith("create") ? () => gradient : () => {}); } });
  const canvas = () => ({ width: 512, height: 512, getContext: () => context });
  Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:canvas}});
  // Geometry, materials, scene methods and animations are real. Only platform/GPU adapters are mocked.
  const view = Object.create(Battlefield.prototype) as Battlefield;
  let draws=0;
  Object.assign(view, {
    renderer:{ render(){draws++;}, setAnimationLoop(){}, dispose(){} }, scene:new THREE.Scene(), camera:new THREE.PerspectiveCamera(44,1,.1,200),
    clock:0, follow:new THREE.Vector3(), snapCamera:true, actors:new Map(), enemies:new Map(), bullets:new Map(), particles:new Map(), hazards:new Map(),
    terminals:[], medkits:[], labels:[], materials:new Map(), door:new THREE.Group(), core:new THREE.Group(), exfil:new THREE.Group(),
    reticle:new THREE.Mesh(new THREE.RingGeometry(.2,.3),new THREE.MeshBasicMaterial()), observer:{disconnect(){}}, textures:[], glow:new THREE.CanvasTexture(canvas() as unknown as HTMLCanvasElement),
    aimTarget:new THREE.Vector3(), mobile:true, reducedMotion:false, bulletGeometry:new THREE.CylinderGeometry(.055,.055,.85,6), particleGeometry:new THREE.IcosahedronGeometry(.11,0),
  });
  const state=view as unknown as Record<string,any>;
  try {
    state.buildLevel();
    const staticLabels=state.labels.length;
    const world=createWorld([{id:"solo",name:"GHOST",color:0}],22,"casual",3);
    world.players.forEach((p,i)=>{p.weapon=i as 0|1|2|3;p.ammo=WEAPONS[i].magazine;p.flash=.07;});
    world.enemies=ENEMY_TYPES.map((type,i)=>({id:100+i,type,hp:ENEMIES[type].hp,maxHp:ENEMIES[type].hp,x:-40+i*8,z:25,angle:0,fire:.01,path:[],pathTime:0,hurt:0}));
    world.effects=["hit","explosion","nova","hack","heal","dash"].map((kind,i)=>({id:200+i,x:-35+i,z:28,t:0,kind:kind as "hit"}));
    world.hazards=[{id:300,x:-38,z:28,born:0,delay:1.9,radius:1.7,hit:false}];
    world.bullets=[{id:400,x:-38,z:28,vx:32,vz:0,life:1,enemy:false,owner:"solo",damage:260,weapon:3}];
    view.render(world,"solo",1/60,true,{...EMPTY_INPUT,ax:1,az:0});
    assert.equal(state.actors.size,4);assert.equal(state.enemies.size,7);
    for(const e of world.enemies) assert.equal(!!state.enemies.get(e.id).userData.rig,ENEMIES[e.type].humanoid);
    assert.ok(state.labels.some((s:THREE.Sprite)=>state.actors.get(world.players[1].id).group.children.includes(s)));
    assert.equal(state.actors.get("solo").weapon,0);
    assert.equal(state.enemies.get(106).scale.x,1.3);
    const extent=new THREE.Box3();
    view.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.computeBoundingBox();const box=o.geometry.boundingBox!;assert.ok(Number.isFinite(box.min.x)&&Number.isFinite(box.max.z));if(o.parent===view.scene)extent.union(box.clone().applyMatrix4(o.matrixWorld));}});
    assert.ok(extent.max.x>=BOUNDS.x && extent.min.z<=-BOUNDS.z,"floor and walls cover the expanded compound");
    view.resetRound();
    for(const key of ["actors","enemies","bullets","particles","hazards"])assert.equal(state[key].size,0);
    assert.equal(state.labels.length,staticLabels,"dynamic label textures are retired with their actors");
    const next=createWorld([{id:"solo",name:"NEW CODENAME",color:0}],55,"casual",0);
    view.render(next,"solo",1/60,true,EMPTY_INPUT);
    assert.equal(state.actors.size,1);assert.equal(state.enemies.size,0);assert.equal(draws,2);
  } finally {
    view.dispose();
    if(old)Object.defineProperty(globalThis,"document",old);else Reflect.deleteProperty(globalThis,"document");
  }
});
