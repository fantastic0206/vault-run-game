import { Battlefield } from "./scene";
import { Controls } from "./controls";
import { createWorld, frame, stepWorld } from "./simulation";
import { sound } from "./audio";
import { EMPTY_INPUT, type Difficulty, type Input, type Room, type World } from "./types";
import { sanitizeInput, validWorld } from "./validate";
import { DEFAULT_WEAPON } from "./weapons";

export interface RuntimeCallbacks {
  hud: (w: World) => void;
  input: (input: Input) => void;
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
  private streams: Record<string, { id: string; retired: Set<string>; dashOffset: number }> = {};
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
      const p =
        this.world.players.find((p) => p.id === this.selfId) ??
        this.world.players[0];
      if (!p) return;
      const input = this.active ? this.controls.read(p) : null;
      this.view.render(
        this.world,
        this.selfId,
        dt,
        this.active,
        input,
        this.multiplayer && !this.authority,
      );
    } catch (error) { this.fail(error); }
  }
  solo(name: string, difficulty: Difficulty = "casual") {
    this.awaitingFrame = false;
    this.multiplayer = false;
    this.authority = true;
    this.selfId = "solo";
    this.gameId = "solo-" + Date.now();
    this.world = createWorld(
      [{ id: "solo", name: name || "Rook", color: 0 }],
      Date.now() >>> 0,
      difficulty,
    );
    this.begin();
  }
  coop(room: Room, checkpoint?: World | null) {
    if (!room.players.some((p) => p.id === room.selfId)) return;
    const cached = checkpoint && validWorld(checkpoint, room.players.map((p) => p.id)) && checkpoint.difficulty === room.difficulty ? checkpoint : null;
    if (this.active && this.gameId === room.gameId) {
      if (cached && this.authority && cached.tick > this.world.tick && cached.time >= this.world.time && !this.ended) {
        this.world = cached;
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
      );
    this.awaitingFrame = !this.authority && !cached;
    this.begin();
  }
  private begin() {
    this.active = true;
    this.failed = false;
    this.ended = false;
    this.paused = false;
    this.controls.reset();
    this.controls.enabled = !this.awaitingFrame;
    this.roster = this.world.players.map((p) => p.id);
    this.inputs = {};
    this.inputAt = {};
    this.streams = {};
    this.effects.clear();
    this.last = this.clock();
    const self = this.world.players.find(p => p.id === this.selfId);
    this.lastAmmo = self?.ammo ?? 12;
    this.lastWeapon = self?.weapon ?? DEFAULT_WEAPON;
    this.controls.restoreCounters?.(self?.lastDash ?? 0);
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
  }
  remoteInput(gameId: string, id: string, value: unknown, streamId = "default") {
    if (!this.authority || !this.active || gameId !== this.gameId || id === this.selfId || !this.roster.includes(id)) return;
    const input = sanitizeInput(value);
    if (!input) return;
    let stream = this.streams[id];
    if (!stream || stream.id !== streamId) {
      if (stream?.retired.has(streamId)) return;
      const retired = stream?.retired ?? new Set<string>();
      if (stream) retired.add(stream.id);
      if (retired.size > 24) retired.delete(retired.values().next().value!);
      stream = this.streams[id] = { id: streamId, retired, dashOffset: Math.max(0, (this.world.players.find((p) => p.id === id)?.lastDash ?? 0) - input.dash) };
      delete this.inputs[id];
    }
    input.dash += stream.dashOffset;
    if (this.inputs[id] && input.seq <= this.inputs[id].seq) return;
    this.inputs[id] = input;
    this.inputAt[id] = this.clock();
  }
  remoteFrame(gameId: string, value: unknown) {
    if (this.authority || !this.active || gameId !== this.gameId || !validWorld(value, this.roster)) return false;
    const w = value;
    if (w.tick < this.world.tick || w.difficulty !== this.world.difficulty || (this.ended && w.status === "playing")) return false;
    this.world = w;
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
          if (!room.players.some((s) => s.id === p.id && !s.left)) p.health = 0;
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
    const
      dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.active) return;
    const p = this.world.players.find((p) => p.id === this.selfId);
    if (!p) return;
    const input = this.controls.read(p);
    this.inputs[this.selfId] = input;
    if (this.authority && (!this.paused || this.multiplayer)) {
      const activeInputs = { ...this.inputs };
      for (const id of Object.keys(activeInputs))
        if (id !== this.selfId && now - (this.inputAt[id] ?? 0) > 1000)
          activeInputs[id] = { ...EMPTY_INPUT, dash: activeInputs[id].dash };
      stepWorld(this.world, activeInputs, dt);
      this.handleEffects();
      if (this.multiplayer && now - this.frameTime > 65) {
        this.callbacks.frame(frame(this.world));
        this.frameTime = now;
      }
    } else if (
      this.multiplayer &&
      !this.authority &&
      now - this.inputTime > 38
    ) {
      this.callbacks.input(input);
      this.inputTime = now;
    }
    if (now - this.hudTime > 90) {
      this.publishHud();
      this.hudTime = now;
    }
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
    if (p && p.weapon === this.lastWeapon && p.ammo < this.lastAmmo) sound("shoot");
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
