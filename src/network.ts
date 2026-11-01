import { PROTOCOL, type Input, type Room, type Session, type World } from "./game/types";
import { sanitizeInput, validRoom, validWorld } from "./game/validate";

export class NetworkError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
export async function roomApi(body: Record<string, unknown>, token?: string) {
  let response: Response;
  try {
    response = await fetch("/api/room", {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000), cache: "no-store",
    });
  } catch { throw new NetworkError("Could not reach the crew. Check your connection and try again."); }
  const data = await response.json().catch(() => ({ error: "The co-op server is unavailable." }));
  if (!response.ok) throw new NetworkError(String(data.error), response.status);
  if (!validRoom(data.room)) throw new NetworkError("The game server has updated. Refresh this page and rejoin the crew.", 409);
  return data as { room: Room; token?: string; id?: string };
}
interface Events {
  room: (room: Room, world?: World | null) => void;
  world: (gameId: string, world: unknown) => void;
  input: (gameId: string, id: string, input: Input, stream: string) => void;
  status: (live: boolean, error: string, terminal?: boolean) => void;
}
export class CrewLink {
  private socket: WebSocket | null = null;
  private socketReady = false;
  private stopped = false;
  private terminal = false;
  private retry = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private room: Room | null = null;
  private lastSocketPacket = 0;
  private lastSocketFrame = 0;
  private lastFrame = 0;
  private lastTick = -1;
  private missionSince = Date.now();
  private httpSuccess = 0;
  private httpBusy = false;
  private pollAgain = false;
  private controller?: AbortController;
  private latestInput: Input | null = null;
  private latestWorld: World | null = null;
  private statusKey = "";
  private stream = globalThis.crypto?.randomUUID?.() ?? `control-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private httpUrl: string;
  live = false;

  constructor(private seat: Session, private events: Events, private options: { url?: string; httpUrl?: string } = {}) {
    this.httpUrl = options.httpUrl ?? (options.url ? options.url.replace(/^ws/, "http").replace(/\/api\/live(?:\?.*)?$/, "/api/sync") : "/api/sync");
    this.connect();
    void this.poll();
  }
  private status(message = "", terminal = false) {
    this.live = !terminal && (this.socketReady || Date.now() - this.httpSuccess < 6000);
    const key = `${this.live}:${message}:${terminal}`;
    if (key !== this.statusKey) { this.statusKey = key; this.events.status(this.live, message, terminal); }
  }
  private connectionStatus() {
    const now = Date.now(), guest = this.room && this.room.hostId !== this.seat.id && this.room.phase === "playing";
    if (guest && now - (this.lastFrame || this.missionSince) > 4000) this.status("Waiting for the squad lead’s mission updates…");
    else if (this.httpSuccess && (!this.socketReady || (guest && now - this.lastSocketFrame > 1400))) this.status("Backup connection active · Crew synchronized");
    else this.status();
  }
  private stopWith(message: string) {
    this.terminal = true; this.socketReady = false; this.httpSuccess = 0;
    clearTimeout(this.pollTimer); clearTimeout(this.reconnectTimer); clearInterval(this.heartbeat);
    this.status(message, true);
    this.socket?.close(4409, "Session needs refresh");
  }
  private acceptRoom(value: unknown, snapshot?: unknown) {
    if (!validRoom(value) || value.code !== this.seat.code || value.selfId !== this.seat.id) return false;
    let next = value;
    if (this.room && value.version < this.room.version) {
      if (value.gameId !== this.room.gameId) return false;
      next = this.room;
    }
    if (next.gameId !== this.room?.gameId) {
      this.latestInput = null; this.latestWorld = null; this.lastTick = -1;
      this.lastFrame = this.lastSocketFrame = 0; this.missionSince = Date.now();
    }
    this.room = next;
    const world = validWorld(snapshot, next.players.map(p => p.id)) ? snapshot : snapshot === null ? null : undefined;
    if (world && world.tick > this.lastTick) { this.lastTick = world.tick; this.lastFrame = Date.now(); }
    this.events.room(next, world);
    return true;
  }
  private acceptWorld(gameId: string, value: unknown, socket: boolean) {
    if (!this.room || gameId !== this.room.gameId || !validWorld(value, this.room.players.map(p => p.id))) return;
    if (value.tick < this.lastTick) return;
    if (value.tick > this.lastTick) { this.lastTick = value.tick; this.lastFrame = Date.now(); }
    if (socket) this.lastSocketFrame = Date.now();
    this.events.world(gameId, value);
    this.connectionStatus();
  }
  private connect() {
    if (this.stopped || this.terminal || typeof WebSocket === "undefined") return;
    const url = this.options.url ?? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/live`;
    let socket: WebSocket;
    try { socket = new WebSocket(url); } catch { this.connectionStatus(); return; }
    this.socket = socket;
    socket.onopen = () => {
      if (this.stopped || this.socket !== socket) { socket.close(); return; }
      socket.send(JSON.stringify({ type: "hello", protocol: PROTOCOL, code: this.seat.code, token: this.seat.token, stream: this.stream }));
    };
    socket.onmessage = event => {
      if (this.stopped || this.terminal || this.socket !== socket) return;
      try {
        const message = JSON.parse(event.data);
        if (!message || typeof message !== "object") return;
        this.lastSocketPacket = Date.now();
        if (message.type === "hello") {
          if (message.protocol !== PROTOCOL || !validRoom(message.room) || message.room.selfId !== this.seat.id) { this.stopWith("The game has updated. Refresh this page and join a fresh room."); return; }
          this.socketReady = true; this.retry = 0;
          this.connectionStatus(); this.acceptRoom(message.room, message.world);
          clearInterval(this.heartbeat);
          this.heartbeat = setInterval(() => {
            if (Date.now() - this.lastSocketPacket > 14000) socket.close(4000, "Heartbeat timeout");
            else this.send({ type: "ping" });
          }, 4000);
          this.resync();
        } else if (message.type === "room" && this.socketReady) {
          if (this.acceptRoom(message.room)) this.resync();
        } else if (message.type === "world" && this.socketReady) this.acceptWorld(message.gameId, message.world, true);
        else if (message.type === "input" && message.gameId === this.room?.gameId && typeof message.sender === "string" && typeof message.stream === "string") {
          const input = sanitizeInput(message.input); if (input) this.events.input(message.gameId, message.sender, input, message.stream);
        } else if (message.type === "error") {
          if (message.terminal) this.stopWith(String(message.error));
          else { this.resync(); if (Date.now() - this.httpSuccess > 2500) this.status("Recovering the crew connection…"); else this.connectionStatus(); }
        }
      } catch { this.resync(); socket.close(4000, "Resync needed"); }
    };
    socket.onerror = () => { if (!this.stopped && this.socket === socket) { this.socketReady = false; this.connectionStatus(); this.resync(); } };
    socket.onclose = event => {
      if (this.socket !== socket) return;
      this.socketReady = false; clearInterval(this.heartbeat);
      if (this.stopped || this.terminal) return;
      if ([4401, 4409].includes(event.code)) { this.stopWith("Your crew session ended or the game updated. Refresh and join a fresh room."); return; }
      this.connectionStatus(); this.resync();
      this.reconnectTimer = setTimeout(() => this.connect(), Math.min(3500, 350 * 2 ** this.retry++));
    };
  }
  private async poll() {
    if (this.stopped || this.terminal) return;
    if (this.httpBusy) { this.pollAgain = true; return; }
    this.httpBusy = true; clearTimeout(this.pollTimer);
    const controller = this.controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const gameId = this.room?.gameId;
    try {
      const host = this.room?.hostId === this.seat.id;
      const payload = { protocol: PROTOCOL, code: this.seat.code, gameId, stream: this.stream,
        ...(host && this.latestWorld ? { world: this.latestWorld } : {}), ...(!host && this.latestInput ? { input: this.latestInput } : {}) };
      const response = await fetch(this.httpUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.seat.token}` }, body: JSON.stringify(payload), cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (this.stopped || this.terminal) return;
      if (!response.ok) {
        if ([401,409].includes(response.status) || (response.status === 404 && /room/i.test(String(data.error)))) { this.stopWith(String(data.error)); return; }
        throw new Error("Backup temporarily unavailable");
      }
      if (data.protocol !== PROTOCOL || !validRoom(data.room) || data.room.selfId !== this.seat.id || data.room.code !== this.seat.code) { this.stopWith("Your crew session or game version has changed. Refresh this page and join a fresh room."); return; }
      this.httpSuccess = Date.now(); this.connectionStatus();
      if (this.acceptRoom(data.room, data.world)) {
        if (data.room.hostId === this.seat.id && Array.isArray(data.inputs)) for (const packet of data.inputs) {
          const input = sanitizeInput(packet.input);
          if (input && packet.gameId === data.room.gameId && typeof packet.sender === "string" && typeof packet.stream === "string") this.events.input(packet.gameId, packet.sender, input, packet.stream);
        }
      }
      this.connectionStatus();
    } catch {
      if (!this.stopped && !this.terminal) {
        if (Date.now() - this.httpSuccess > 6000 && !this.socketReady) this.status("Reconnecting to the crew…");
        else this.connectionStatus();
      }
    } finally {
      clearTimeout(timeout); this.httpBusy = false;
      if (!this.stopped && !this.terminal) {
        const host = this.room?.hostId === this.seat.id, stale = Date.now() - (this.lastFrame || this.missionSince) > 800;
        const delay = this.pollAgain ? 180 : this.room?.phase === "playing" && (host || stale || !this.socketReady) ? 220 : this.room?.phase === "lobby" ? 700 : 1500;
        this.pollAgain = false; this.pollTimer = setTimeout(() => void this.poll(), delay);
      }
    }
  }
  resync() { if (this.httpBusy) this.pollAgain = true; else { clearTimeout(this.pollTimer); this.pollTimer = setTimeout(() => void this.poll(), 180); } }
  input(gameId: string, input: Input) { if (gameId === this.room?.gameId) this.latestInput = input; this.send({ type: "input", gameId, input }); }
  world(gameId: string, world: World) { if (gameId === this.room?.gameId) this.latestWorld = world; this.send({ type: "world", gameId, world }); }
  private send(packet: unknown) { if (this.socketReady && this.socket?.readyState === 1 && this.socket.bufferedAmount < 300000) this.socket.send(JSON.stringify(packet)); }
  close() {
    this.stopped = true; this.live = false; this.socketReady = false;
    clearTimeout(this.reconnectTimer); clearTimeout(this.pollTimer); clearInterval(this.heartbeat);
    this.controller?.abort(); this.socket?.close();
  }
}
