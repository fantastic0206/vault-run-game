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
import { syncRequest } from "../server/sync.ts";

async function waitFor(predicate:()=>boolean) {
  const end=Date.now()+4000;
  while(!predicate()) { if(Date.now()>end) throw new Error("Client state did not converge"); await new Promise(r=>setTimeout(r,10)); }
}
async function listen(server:Server) {
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  return `ws://127.0.0.1:${(server.address() as {port:number}).port}/api/live`;
}
function httpServer(store: MemoryStorage) {
  return createServer((req,res)=>{void (async()=>{
    if(req.url!=="/api/sync"){res.writeHead(404);res.end();return;}
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString()),token=String(req.headers.authorization??"").replace(/^Bearer /,"");
    const result=await syncRequest(body,token,store);
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify(result));
  })().catch((e)=>{res.writeHead(e.status??503,{"Content-Type":"application/json"});res.end(JSON.stringify({error:e.message}));});});
}
function browserClient(seat:Session,url:string) {
  let seq=0, mx=.6, weapon: -1|0|1|2|3=-1;
  const faults:string[]=[], states:Room[]=[];
  const controls={enabled:false,reset(){},read(){return {...EMPTY_INPUT,mx:this.enabled?mx:0,seq:++seq,weapon};},dispose(){}};
  const runtime=new Runtime({} as HTMLCanvasElement,{view:{renderer:{setAnimationLoop(){}},render(){},dispose(){}} as unknown as Battlefield,controls:controls as unknown as Controls});
  const client={runtime,faults,states,link:null as CrewLink|null,live:false,direction:(value:number)=>{mx=value;},select:(value:0|1|2|3)=>{weapon=value;},close(){client.link?.close();runtime.dispose();}};
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
  const store=new MemoryStorage(),a=httpServer(store),b=httpServer(store),liveA=attachLive(a,store),liveB=attachLive(b,store);
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

test("guests keep moving through durable sync when every pub/sub message is lost",async()=>{
  class BrokenRelay extends MemoryStorage { override async publish() { /* Simulate an open socket with a dead cross-instance relay. */ } }
  const store=new BrokenRelay(),a=httpServer(store),b=httpServer(store),liveA=attachLive(a,store),liveB=attachLive(b,store);
  const clients:ReturnType<typeof browserClient>[]=[];
  try {
    const [urlA,urlB]=await Promise.all([listen(a),listen(b)]);
    const host=await roomRequest({type:"create",name:"Lead"},"","ip",store);
    const seats=[host];for(const name of ["One","Two","Three"])seats.push(await roomRequest({type:"join",code:host.room.code,name},"",name,store));
    for(let i=0;i<4;i++){const s=seats[i];clients.push(browserClient({id:s.id!,code:s.room.code,token:s.token!},i%2?urlB:urlA));}
    await waitFor(()=>clients.every(c=>c.live));
    for(const s of seats)await roomRequest({type:"sync",code:host.room.code,live:true},s.token!,"ip",store);
    await roomRequest({type:"start",code:host.room.code,live:true},host.token!,"ip",store);
    await waitFor(()=>clients.every(c=>c.runtime.active&&!c.runtime.awaitingFrame&&c.runtime.world.tick>20));
    const guest=clients[1],before=clients[0].runtime.world.players[1].x;
    guest.direction(-.8);
    await waitFor(()=>clients[0].runtime.world.players[1].x<before-.3);
    await waitFor(()=>guest.runtime.world.players[1].x<before-.2);
    guest.select(2);
    await waitFor(()=>clients[0].runtime.world.players[1].weapon===2 && guest.runtime.world.players[1].weapon===2);
    for(const c of clients)assert.deepEqual(c.faults,[]);
  } finally {
    clients.forEach(c=>c.close());for(const live of [liveA,liveB]){live.wss.clients.forEach(ws=>ws.terminate());live.close();}
    a.closeAllConnections();b.closeAllConnections();
    await Promise.all([new Promise<void>(r=>a.close(()=>r())),new Promise<void>(r=>b.close(()=>r()))]);
  }
});

test("a provider that rejects both publish and subscribe still allows guest movement via backup sync",async()=>{
  class NoPubsub extends MemoryStorage {
    override async publish(){throw new Error("Publish unavailable");}
    override async subscribe():Promise<()=>void>{throw new Error("Subscribe unavailable");}
  }
  const store=new NoPubsub(),a=httpServer(store),b=httpServer(store),liveA=attachLive(a,store),liveB=attachLive(b,store),clients:ReturnType<typeof browserClient>[]=[];
  try {
    const [urlA,urlB]=await Promise.all([listen(a),listen(b)]);
    const host=await roomRequest({type:"create",name:"Lead"},"","ip",store),guest=await roomRequest({type:"join",code:host.room.code,name:"Guest"},"","ip2",store);
    for(const [s,url] of [[host,urlA],[guest,urlB]] as const)clients.push(browserClient({id:s.id!,code:s.room.code,token:s.token!},url));
    await waitFor(()=>clients.every(c=>c.live));
    for(const s of [host,guest])await roomRequest({type:"sync",code:host.room.code,live:true},s.token!,"ip",store);
    await roomRequest({type:"start",code:host.room.code,live:true},host.token!,"ip",store);
    await waitFor(()=>clients.every(c=>c.runtime.active&&!c.runtime.awaitingFrame&&c.runtime.world.tick>20));
    clients[1].select(0);await waitFor(()=>clients.every(c=>c.runtime.world.players[1].weapon===0));
    await waitFor(()=>clients[0].runtime.world.players[1].x>-16);
    assert.deepEqual(clients.flatMap(c=>c.faults),[]);
  }finally{clients.forEach(c=>c.close());for(const l of [liveA,liveB]){l.wss.clients.forEach(ws=>ws.terminate());l.close();}a.closeAllConnections();b.closeAllConnections();await Promise.all([new Promise<void>(r=>a.close(()=>r())),new Promise<void>(r=>b.close(()=>r()))]);}
});

test("two clients can start and play when WebSocket upgrades are blocked entirely",async()=>{
  const store=new MemoryStorage(),a=httpServer(store),b=httpServer(store),clients:ReturnType<typeof browserClient>[]=[];
  for(const server of [a,b])server.on("upgrade",(_req,socket)=>socket.destroy());
  try {
    const [urlA,urlB]=await Promise.all([listen(a),listen(b)]);
    const host=await roomRequest({type:"create",name:"Lead"},"","ip",store),guest=await roomRequest({type:"join",code:host.room.code,name:"Guest"},"","ip2",store);
    for(const [s,url] of [[host,urlA],[guest,urlB]] as const)clients.push(browserClient({id:s.id!,code:s.room.code,token:s.token!},url));
    await waitFor(()=>clients.every(c=>c.live));
    for(const s of [host,guest])await roomRequest({type:"sync",code:host.room.code,live:true},s.token!,"ip",store);
    await roomRequest({type:"start",code:host.room.code,live:true},host.token!,"ip",store);
    await waitFor(()=>clients.every(c=>c.runtime.active&&!c.runtime.awaitingFrame&&c.runtime.world.tick>15));
    await waitFor(()=>clients[0].runtime.world.players[1].x>-16.5);
    assert.deepEqual(clients.flatMap(c=>c.faults),[]);
  } finally {clients.forEach(c=>c.close());a.closeAllConnections();b.closeAllConnections();await Promise.all([new Promise<void>(r=>a.close(()=>r())),new Promise<void>(r=>b.close(()=>r()))]);}
});
