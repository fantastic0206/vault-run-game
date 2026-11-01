import { Battlefield } from "./scene";
import { Controls } from "./controls";
import { createWorld, frame, stepWorld } from "./simulation";
import { sound } from "./audio";
import { EMPTY_INPUT, type Input, type Room, type World } from "./types";

export interface RuntimeCallbacks {
  hud: (w: World) => void;
  input: (input: Input) => void;
  frame: (w: World) => void;
  outcome: (w: World) => void;
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
  callbacks: RuntimeCallbacks = {
    hud: () => {},
    input: () => {},
    frame: () => {},
    outcome: () => {},
  };
  private inputs: Record<string, Input> = {};
  private inputAt: Record<string, number> = {};
  private timer: ReturnType<typeof setInterval>;
  private last = performance.now();
  private lastRender = performance.now();
  private hudTime = 0;
  private frameTime = 0;
  private inputTime = 0;
  private ended = false;
  private effects = new Set<number>();
  private lastAmmo = 14;
  constructor(canvas: HTMLCanvasElement) {
    this.world = createWorld([{ id: "solo", name: "Rook", color: 0 }]);
    // Attract mode shows the actual level and operative, not a pre-rendered image.
    this.world.players[0].x = -4;
    this.world.players[0].z = 6;
    this.view = new Battlefield(canvas);
    this.controls = new Controls(canvas, this.view);
    this.timer = setInterval(() => this.tick(), 1000 / 60);
    this.view.renderer.setAnimationLoop(() => {
      const now = performance.now(),
        dt = Math.min(0.1, (now - this.lastRender) / 1000);
      this.lastRender = now;
      const p =
        this.world.players.find((p) => p.id === this.selfId) ??
        this.world.players[0];
      const input = this.active ? this.controls.read(p) : null;
      this.view.render(
        this.world,
        this.selfId,
        dt,
        this.active,
        input,
        this.multiplayer && !this.authority,
      );
    });
  }
  solo(name: string) {
    this.multiplayer = false;
    this.authority = true;
    this.selfId = "solo";
    this.gameId = "solo-" + Date.now();
    this.world = createWorld(
      [{ id: "solo", name: name || "Rook", color: 0 }],
      Date.now() >>> 0,
    );
    this.begin();
  }
  coop(room: Room, checkpoint?: World | null) {
    if (this.active && this.gameId === room.gameId) return;
    this.multiplayer = true;
    this.selfId = room.selfId;
    this.authority = room.hostId === room.selfId;
    this.gameId = room.gameId;
    this.world =
      checkpoint ??
      createWorld(
        room.players,
        [...room.gameId].reduce(
          (n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0,
          7,
        ) >>> 0,
      );
    this.begin();
  }
  private begin() {
    this.active = true;
    this.ended = false;
    this.paused = false;
    this.controls.reset();
    this.controls.enabled = true;
    this.inputs = {};
    this.inputAt = {};
    this.effects.clear();
    this.last = performance.now();
    this.lastAmmo = 14;
    this.callbacks.hud(frame(this.world));
  }
  menu() {
    this.active = false;
    this.controls.enabled = false;
    this.controls.reset();
    this.paused = false;
  }
  pause(value: boolean) {
    this.paused = value;
    this.controls.enabled = this.active && !value;
    if (value) this.controls.reset();
  }
  remoteInput(id: string, input: Input) {
    if (this.inputs[id] && input.seq <= this.inputs[id].seq) return;
    this.inputs[id] = input;
    this.inputAt[id] = performance.now();
  }
  remoteFrame(w: World) {
    if (this.authority || !this.active) return;
    if (w.tick < this.world.tick) return;
    this.world = w;
    this.handleEffects();
    this.publishHud();
  }
  roomUpdate(room: Room) {
    if (this.active && this.multiplayer && room.gameId === this.gameId) {
      if (this.authority)
        for (const p of this.world.players)
          if (!room.players.some((s) => s.id === p.id)) p.health = 0;
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
  private tick() {
    const now = performance.now(),
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
        if (id !== this.selfId && now - (this.inputAt[id] ?? 0) > 350)
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
  }
  private handleEffects() {
    const p = this.world.players.find((p) => p.id === this.selfId);
    if (p && p.ammo < this.lastAmmo) sound("shoot");
    if (p) this.lastAmmo = p.ammo;
    for (const e of this.world.effects)
      if (!this.effects.has(e.id)) {
        this.effects.add(e.id);
        if (e.kind !== "hit" || (p && Math.hypot(e.x - p.x, e.z - p.z) < 1))
          sound(e.kind);
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
