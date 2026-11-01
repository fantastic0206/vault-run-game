import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { CrewLink } from "../src/network.ts";
import { Runtime } from "../src/game/runtime.ts";
import type { Battlefield } from "../src/game/scene.ts";
import type { Controls } from "../src/game/controls.ts";
import { EMPTY_INPUT, type Room, type Session } from "../src/game/types.ts";
import { attachLive } from "../server/live.ts";
import { roomRequest } from "../server/rooms.ts";
import { MemoryStorage } from "../server/storage.ts";

async function waitFor(predicate:()=>boolean) {
  const end=Date.now()+4000;
  while(!predicate()) { if(Date.now()>end) throw new Error("Client state did not converge"); await new Promise(r=>setTimeout(r,10)); }
}
async function listen(server:Server) {
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  return `ws://127.0.0.1:${(server.address() as {port:number}).port}/api/live`;
}
function browserClient(seat:Session,url:string) {
  let seq=0, mx=.6;
  const faults:string[]=[], states:Room[]=[];
  const controls={enabled:false,reset(){},read(){return {...EMPTY_INPUT,mx:this.enabled?mx:0,seq:++seq};},dispose(){}};
  const runtime=new Runtime({} as HTMLCanvasElement,{view:{renderer:{setAnimationLoop(){}},render(){},dispose(){}} as unknown as Battlefield,controls:controls as unknown as Controls});
  const client={runtime,faults,states,link:null as CrewLink|null,live:false,direction:(value:number)=>{mx=value;},close(){client.link?.close();runtime.dispose();}};
  const link=new CrewLink(seat,{
    status(connected,error,terminal){client.live=connected;if(terminal)faults.push(error);},
    room(room,checkpoint){states.push(room);if(room.phase==="lobby")runtime.menu();else{runtime.coop(room,checkpoint);runtime.roomUpdate(room);}},
    input(gameId,id,input,stream){runtime.remoteInput(gameId,id,input,stream);},
    world(gameId,w){runtime.remoteFrame(gameId,w);},
  },{url});
  runtime.callbacks={...runtime.callbacks,input:input=>link.input(runtime.gameId,input),frame:w=>link.world(runtime.gameId,w),fault:message=>faults.push(message)};
  client.link=link;
  return client;
}
test("host plus three guest clients can play across two servers, refresh a guest, lose a member, and rematch",async()=>{
  const store=new MemoryStorage(),a=createServer(),b=createServer(),liveA=attachLive(a,store),liveB=attachLive(b,store);
  const clients:ReturnType<typeof browserClient>[]=[],allClients:ReturnType<typeof browserClient>[]=[];
  try {
    const [urlA,urlB]=await Promise.all([listen(a),listen(b)]);
    const host=await roomRequest({type:"create",name:"Rook"},"","host",store);
    const seats=[host];
    for(const name of ["Ghost","Cipher","Ember"]) seats.push(await roomRequest({type:"join",code:host.room.code,name},"",name,store));
    for(let i=0;i<seats.length;i++) {const s=seats[i],c=browserClient({id:s.id!,token:s.token!,code:s.room.code},i%2?urlB:urlA);clients.push(c);allClients.push(c);}
    await waitFor(()=>clients.every(c=>c.live));
    for(const s of seats) await roomRequest({type:"sync",code:host.room.code,live:true},s.token!,"ip",store);
    const first=await roomRequest({type:"start",code:host.room.code,live:true},host.token!,"ip",store);
    await waitFor(()=>clients.every(c=>c.runtime.active && c.runtime.world.tick>10 && !c.runtime.awaitingFrame));
    const ghost=clients[1];ghost.close();
    const replacement=browserClient({id:seats[1].id!,token:seats[1].token!,code:host.room.code},urlA);replacement.direction(-.6);clients[1]=replacement;allClients.push(replacement);
    await waitFor(()=>replacement.live && !replacement.runtime.awaitingFrame && replacement.runtime.world.tick>10);
    const before=clients[0].runtime.world.players.find(p=>p.id===seats[1].id)!.x;
    await waitFor(()=>clients[0].runtime.world.players.find(p=>p.id===seats[1].id)!.x<before-.35);
    const left=await roomRequest({type:"leave",code:host.room.code,live:true},seats[3].token!,"ip",store);clients[3].close();
    assert.equal(left.room.players.length,4,"the running mission keeps a fixed roster");
    await waitFor(()=>clients.slice(0,3).every(c=>c.runtime.world.players.find(p=>p.id===seats[3].id)?.health===0));
    await roomRequest({type:"finish",code:host.room.code,live:true,gameId:first.room.gameId,result:"lost"},host.token!,"ip",store);
    await waitFor(()=>clients.slice(0,3).every(c=>c.runtime.world.status==="lost"));
    const lobby=await roomRequest({type:"rematch",code:host.room.code,live:true},host.token!,"ip",store);
    assert.equal(lobby.room.players.length,3);
    await waitFor(()=>clients.slice(0,3).every(c=>!c.runtime.active));
    const second=await roomRequest({type:"start",code:host.room.code,live:true},host.token!,"ip",store);
    assert.notEqual(second.room.gameId,first.room.gameId);
    await waitFor(()=>clients.slice(0,3).every(c=>c.runtime.gameId===second.room.gameId && c.runtime.world.tick>5 && c.runtime.world.players.length===3));
    for(const c of clients.slice(0,3)) assert.deepEqual(c.faults,[]);
  } finally {
    allClients.forEach(c=>c.close());
    for(const live of [liveA,liveB]) {live.wss.clients.forEach(ws=>ws.terminate());live.close();}
    await Promise.all([new Promise<void>(r=>a.close(()=>r())),new Promise<void>(r=>b.close(()=>r()))]);
  }
});
