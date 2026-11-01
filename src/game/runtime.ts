import { Battlefield } from "./scene";
import { Controls } from "./controls";
import { createWorld, frame, stepWorld } from "./simulation";
import { sound } from "./audio";
import { EMPTY_INPUT, type Difficulty, type Input, type PlayerCommand, type Room, type World } from "./types";
import { sanitizeCommands, sanitizeInput, validWorld } from "./validate";
import { DEFAULT_WEAPON } from "./weapons";
import { STEP } from "./player";
import { LocalPrediction, Presentation } from "./prediction";

export interface RuntimeCallbacks {
  hud: (w: World) => void;
  input: (input: Input, commands?: PlayerCommand[]) => void;
  frame: (w: World) => void;
  outcome: (w: World) => void;
  fault: (message: string) => void;
}
export class Runtime {
  view: Battlefield;
  controls: Controls;
  world: World;
  active = false;
  authority = true;
  multiplayer = false;
  paused = false;
  selfId = "solo";
  gameId = "";
  readonly controlStream = globalThis.crypto?.randomUUID?.() ?? `control-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  prediction: LocalPrediction | null = null;
  private presentation = new Presentation();
  private accumulator = 0;
  private currentInput: Input = { ...EMPTY_INPUT };
  awaitingFrame = false;
  callbacks: RuntimeCallbacks = {
    hud: () => {},
    input: () => {},
    frame: () => {},
    outcome: () => {},
    fault: () => {},
  };
  private inputs: Record<string, Input> = {};
  private inputAt: Record<string, number> = {};
  private streams: Record<string, { id: string; retired: Set<string>; dashOffset: number; queue: Map<number, PlayerCommand>; credit: number; commandMode: boolean }> = {};
  private clock: () => number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private last = performance.now();
  private lastRender = performance.now();
  private hudTime = 0;
  private frameTime = 0;
  private inputTime = 0;
  private ended = false;
  private effects = new Set<number>();
  private lastAmmo = 14;
  private lastWeapon = DEFAULT_WEAPON;
  private roster: string[] = [];
  private failed = false;
  constructor(canvas: HTMLCanvasElement, options: { view?: Battlefield; controls?: Controls; autoStart?: boolean; now?: () => number } = {}) {
    this.clock = options.now ?? (() => performance.now());
    this.last = this.lastRender = this.clock();
    this.world = createWorld([{ id: "solo", name: "Rook", color: 0 }]);
    // Attract mode shows the actual level and operative, not a pre-rendered image.
    this.world.players[0].x = -4;
    this.world.players[0].z = 6;
    this.view = options.view ?? new Battlefield(canvas);
    this.controls = options.controls ?? new Controls(canvas, this.view);
    if (options.autoStart !== false) this.timer = setInterval(() => this.tick(), 1000 / 60);
    this.view.renderer.setAnimationLoop(() => this.renderFrame());
  }
  renderFrame(now = this.clock()) {
    if (this.failed) return;
    try {
      const
        dt = Math.min(0.1, (now - this.lastRender) / 1000);
      this.lastRender = now;
      const p = this.prediction?.player ?? this.world.players.find(p => p.id === this.selfId) ?? this.world.players[0];
      if (!p) return;
      const visual = this.active && !(this.paused && !this.multiplayer) ? this.presentation.sample(now, p, this.prediction ?? undefined) ?? this.world : this.world;
      this.view.render(
        visual,
        this.selfId,
        dt,
        this.active,
        this.active ? this.currentInput : null,
        false,
      );
    } catch (error) { this.fail(error); }
  }
  solo(name: string, difficulty: Difficulty = "casual", bots = 1) {
    this.awaitingFrame = false;
    this.multiplayer = false;
    this.authority = true;
    this.selfId = "solo";
    this.gameId = "solo-" + Date.now();
    this.world = createWorld(
      [{ id: "solo", name: name || "Rook", color: 0 }],
      Date.now() >>> 0,
      difficulty,
      bots,
    );
    this.begin();
  }
  coop(room: Room, checkpoint?: World | null) {
    if (!room.players.some((p) => p.id === room.selfId)) return;
    const cached = checkpoint && validWorld(checkpoint, room.players.map((p) => p.id)) && checkpoint.difficulty === room.difficulty && checkpoint.bots === room.bots ? checkpoint : null;
    if (this.active && this.gameId === room.gameId) {
      if (cached && this.authority && cached.tick > this.world.tick && cached.time >= this.world.time && !this.ended) {
        this.world = cached;
        this.inputs = {}; this.inputAt = {}; this.streams = {}; this.accumulator = 0;
        this.world.players.find(p => p.id === this.selfId)!.inputStream = this.controlStream;
        this.presentation.clear(); this.presentation.push(this.world, this.clock());
        this.controls.restoreCounters?.(cached.players.find(p => p.id === this.selfId)?.lastDash ?? 0);
        this.publishHud();
      } else if (cached && !this.authority) this.remoteFrame(room.gameId, cached);
      return;
    }
    this.multiplayer = true;
    this.selfId = room.selfId;
    this.authority = room.hostId === room.selfId;
    this.gameId = room.gameId;
    this.world =
      cached ??
      createWorld(
        room.players,
        [...room.gameId].reduce(
          (n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0,
          7,
        ) >>> 0,
        room.difficulty,
        room.bots,
      );
    this.awaitingFrame = !this.authority && !cached;
    this.begin();
  }
  private begin() {
    this.view.resetRound?.();
    this.active = true;
    this.failed = false;
    this.ended = false;
    this.paused = false;
    this.controls.reset();
    this.controls.enabled = !this.awaitingFrame;
    this.roster = this.world.players.filter(p => !p.isBot).map(p => p.id);
    this.inputs = {};
    this.inputAt = {};
    this.streams = {};
    this.effects.clear();
    this.last = this.clock();
    const self = this.world.players.find(p => p.id === this.selfId);
    this.lastAmmo = self?.ammo ?? 12;
    this.lastWeapon = self?.weapon ?? DEFAULT_WEAPON;
    this.controls.restoreCounters?.(self?.lastDash ?? 0);
    this.accumulator = 0;
    this.currentInput = { ...EMPTY_INPUT };
    if (self && this.authority) self.inputStream = this.controlStream;
    this.prediction = !this.authority && self && !this.awaitingFrame ? new LocalPrediction(self, this.controlStream) : null;
    this.presentation.clear(); this.presentation.push(this.world, this.clock());
    this.lastRender = this.last;
    this.frameTime = 0;
    this.inputTime = 0;
    this.callbacks.hud(frame(this.world));
  }
  menu() {
    this.active = false;
    this.controls.enabled = false;
    this.controls.reset();
    this.paused = false;
    this.awaitingFrame = false;
  }
  pause(value: boolean) {
    this.paused = value;
    this.controls.enabled = this.active && !value && !this.awaitingFrame;
    if (value) this.controls.reset();
    else if (!this.multiplayer) { this.presentation.clear(); this.presentation.push(this.world, this.clock()); }
  }
  remoteInput(gameId: string, id: string, value: unknown, streamId = "default", commands?: unknown) {
    if (!this.authority || !this.active || gameId !== this.gameId || id === this.selfId || !this.roster.includes(id)) return;
    const input = sanitizeInput(value), batch = commands === undefined ? undefined : sanitizeCommands(commands);
    if (!input || batch === null) return;
    const p = this.world.players.find(p => p.id === id)!;
    let stream = this.streams[id];
    if (!stream || stream.id !== streamId) {
      if (stream?.retired.has(streamId)) return;
      const retired = stream?.retired ?? new Set<string>();
      if (stream) retired.add(stream.id);
      if (retired.size > 24) retired.delete(retired.values().next().value!);
      stream = this.streams[id] = { id: streamId, retired, dashOffset: Math.max(0, p.lastDash - (batch?.[0]?.input.dash ?? input.dash)), queue: new Map(), credit: .1, commandMode: batch !== undefined };
      p.inputStream = streamId; p.lastInput = 0; p.vx = p.vz = 0;
      delete this.inputs[id];
    }
    if (batch !== undefined) {
      stream.commandMode = true;
      for (const command of batch) if (command.input.seq > p.lastInput && stream.queue.size < 180) stream.queue.set(command.input.seq, { input: { ...command.input, dash: command.input.dash + stream.dashOffset }, dt: command.dt });
    }
    input.dash += stream.dashOffset;
    if (!this.inputs[id] || input.seq > this.inputs[id].seq) this.inputs[id] = input;
    this.inputAt[id] = this.clock();
  }
  remoteFrame(gameId: string, value: unknown) {
    if (this.authority || !this.active || gameId !== this.gameId || !validWorld(value, this.roster)) return false;
    const w = value;
    if (w.tick < this.world.tick || w.difficulty !== this.world.difficulty || (this.ended && w.status === "playing")) return false;
    this.world = w;
    const self = w.players.find(p => p.id === this.selfId)!;
    if (!this.prediction) { this.prediction = new LocalPrediction(self, this.controlStream); this.controls.restoreCounters?.(self.lastDash); }
    else this.prediction.reconcile(w);
    this.presentation.push(w, this.clock());
    this.awaitingFrame = false;
    this.controls.enabled = !this.paused && !this.ended;
    this.handleEffects();
    this.publishHud();
    return true;
  }
  roomUpdate(room: Room) {
    if (this.active && this.multiplayer && room.gameId === this.gameId) {
      if (this.authority)
        for (const p of this.world.players)
          if (!p.isBot && !room.players.some((s) => s.id === p.id && !s.left)) p.health = 0;
      if (
        room.phase === "finished" &&
        room.result &&
        this.world.status === "playing"
      ) {
        this.world.status = room.result;
        this.world.reason =
          room.result === "aborted"
            ? "The host disconnected. Regroup and run it back."
            : room.result === "won"
              ? "Core secured. The whole crew gets a cut."
              : "The crew is down. Security takes this round.";
        this.publishHud();
      }
    }
  }
  tick(now = this.clock()) {
    if (this.failed) return;
    try {
      const elapsed = Math.max(0, Math.min(.15, (now - this.last) / 1000));
      this.last = now;
      if (!this.active || (this.paused && !this.multiplayer)) { this.accumulator = 0; return; }
      this.accumulator += elapsed;
      let count = 0;
      while (this.accumulator + 1e-8 >= STEP && count++ < 9) {
        this.accumulator -= STEP;
        const p = this.prediction?.player ?? this.world.players.find(p => p.id === this.selfId);
        if (!p) return;
        // Read once per simulation step. Rendering must never consume input sequence numbers.
        const input = this.currentInput = this.controls.read(p);
        this.inputs[this.selfId] = input;
        if (this.authority) {
          const activeInputs = { ...this.inputs }, batches: Record<string, PlayerCommand[]> = {};
          for (const id of this.roster) {
            if (id === this.selfId) continue;
            const stream = this.streams[id], remote = this.world.players.find(p => p.id === id)!;
            if (stream?.commandMode) {
              stream.credit = Math.min(3, stream.credit + STEP);
              const batch: PlayerCommand[] = [];
              for (const [seq, command] of [...stream.queue].sort((a, b) => a[0] - b[0])) {
                if (seq <= remote.lastInput) { stream.queue.delete(seq); continue; }
                if (command.dt > stream.credit + 1e-8 || batch.length >= 8) break;
                batch.push(command); stream.queue.delete(seq); stream.credit -= command.dt;
              }
              batches[id] = batch;
              if (!batch.length && now - (this.inputAt[id] ?? 0) > 150) remote.moving = remote.vx = remote.vz = 0;
            }
            if (now - (this.inputAt[id] ?? 0) > 1000) activeInputs[id] = { ...EMPTY_INPUT, dash: remote.lastDash };
          }
          stepWorld(this.world, activeInputs, STEP, batches);
        } else if (!this.awaitingFrame && this.prediction) {
          if (this.prediction.advance(input, STEP, now, this.world)) sound("shoot");
        }
      }
      if (this.authority) {
        this.handleEffects(); this.presentation.push(this.world, now);
        if (this.multiplayer && now - this.frameTime >= 50) { this.callbacks.frame(frame(this.world)); this.frameTime = now; }
      } else if (!this.awaitingFrame && this.prediction && now - this.inputTime >= 33) {
        this.callbacks.input(this.currentInput, this.prediction.pending.slice(0, 64)); this.inputTime = now;
      }
      if (now - this.hudTime > 90) { this.publishHud(); this.hudTime = now; }
    } catch (error) { this.fail(error); }
  }
  private fail(error: unknown) {
    this.failed = true;
    this.controls.enabled = false;
    this.controls.reset();
    console.error("Mission runtime stopped", error instanceof Error ? error.message : "Invalid state");
    this.callbacks.fault("The mission could not continue on this device. Return to base and rejoin the crew, or reload with low graphics enabled.");
  }
  private handleEffects() {
    const p = this.world.players.find((p) => p.id === this.selfId);
    if (this.authority && p && p.weapon === this.lastWeapon && p.ammo < this.lastAmmo) sound("shoot");
    if (p) { this.lastAmmo = p.ammo; this.lastWeapon = p.weapon; }
    for (const e of this.world.effects)
      if (!this.effects.has(e.id)) {
        this.effects.add(e.id);
        if (e.kind !== "hit" || (p && Math.hypot(e.x - p.x, e.z - p.z) < 1))
          sound(e.kind === "nova" ? "explosion" : e.kind);
      }
    if (this.effects.size > 200)
      this.effects = new Set(this.world.effects.map((e) => e.id));
  }
  private publishHud() {
    const snapshot = frame(this.world);
    if (this.prediction) snapshot.players = snapshot.players.map(p => p.id === this.selfId ? structuredClone(this.prediction!.player) : p);
    this.callbacks.hud(snapshot);
    if (this.world.status !== "playing" && !this.ended) {
      this.ended = true;
      this.controls.enabled = false;
      if (this.world.status === "won") sound("win");
      this.callbacks.outcome(snapshot);
    }
  }
  dispose() {
    clearInterval(this.timer);
    this.controls.dispose();
    this.view.dispose();
  }
}
