import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "../server/storage.ts";
import { roomRequest } from "../server/rooms.ts";
import { syncRequest, persistFrame } from "../server/sync.ts";
import { createWorld, frame } from "../src/game/simulation.ts";
import { PROTOCOL, EMPTY_INPUT } from "../src/game/types.ts";

async function crew() {
  const store=new MemoryStorage(),host=await roomRequest({type:"create",name:"Lead"},"","h",store),guest=await roomRequest({type:"join",code:host.room.code,name:"Guest"},"","g",store);
  for(const s of [host,guest])await roomRequest({type:"sync",code:host.room.code,live:true},s.token!,"ip",store);
  const started=await roomRequest({type:"start",code:host.room.code,live:true},host.token!,"ip",store);
  const packet={protocol:PROTOCOL,code:host.room.code,gameId:started.room.gameId};
  const world=createWorld(started.room.players,44,started.room.difficulty);world.tick=100;world.time=2;
  return {store,host,guest,packet,world};
}
test("durable sync authenticates roles, transfers guest controls and restores the host state without pub/sub",async()=>{
  const {store,host,guest,packet,world}=await crew();
  await syncRequest({...packet,world:frame(world)},host.token!,store);
  const state=await syncRequest({...packet,stream:"control-guest-test-123",input:{...EMPTY_INPUT,mx:1,seq:1,weapon:2}},guest.token!,store);
  assert.equal(state.world!.tick,100);assert.equal(state.room.selfId,guest.id);
  const lead=await syncRequest(packet,host.token!,store);
  assert.equal(lead.inputs.length,1);assert.equal(lead.inputs[0].input.weapon,2);assert.equal(lead.inputs[0].sender,guest.id);
  assert.ok(!JSON.stringify(state).includes(host.token!));
  await assert.rejects(()=>syncRequest({...packet,world:frame(world)},guest.token!,store),e=>(e as any).status===403);
  await assert.rejects(()=>syncRequest(packet,"0".repeat(64),store),e=>(e as any).status===401);
});
test("late snapshots and out-of-order inputs cannot rewind the durable state",async()=>{
  const {store,host,guest,packet,world}=await crew();
  await persistFrame(store,packet.code,packet.gameId,world);
  assert.equal(await persistFrame(store,packet.code,packet.gameId,{...world,tick:1,time:.1}),false);
  for(const seq of [5,2])await syncRequest({...packet,stream:"control-guest-test-123",input:{...EMPTY_INPUT,mx:seq===5?1:-1,seq}},guest.token!,store);
  const state=await syncRequest(packet,host.token!,store);
  assert.equal(state.world!.tick,100);assert.equal(state.inputs[0].input.seq,5);assert.equal(state.inputs[0].input.mx,1);
});
test("old mission controls, old builds and malformed snapshots are rejected",async()=>{
  const {store,host,guest,packet,world}=await crew();
  await syncRequest({...packet,gameId:"old-raid",stream:"control-guest-test-123",input:{...EMPTY_INPUT,seq:50}},guest.token!,store);
  assert.equal((await syncRequest(packet,host.token!,store)).inputs.length,0);
  await assert.rejects(()=>syncRequest({...packet,protocol:1},host.token!,store),e=>(e as any).status===409);
  await assert.rejects(()=>syncRequest({...packet,world:{...world,players:[null]}},host.token!,store),e=>(e as any).status===400);
});
test("joining and starting a room still return valid seats when pub/sub publication fails",async()=>{
  class FailedPubsub extends MemoryStorage {override async publish(){throw new Error("Pubsub unavailable");}}
  const store=new FailedPubsub(),host=await roomRequest({type:"create",name:"Lead"},"","h",store);
  const guest=await roomRequest({type:"join",code:host.room.code,name:"Guest"},"","g",store);
  assert.equal(guest.room.players.length,2);assert.equal(guest.token!.length,64);
  for(const s of [host,guest])await roomRequest({type:"sync",code:host.room.code,live:true},s.token!,"ip",store);
  const started=await roomRequest({type:"start",code:host.room.code,live:true},host.token!,"ip",store);
  assert.equal(started.room.phase,"playing");
});
