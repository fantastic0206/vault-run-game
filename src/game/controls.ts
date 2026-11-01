import { EMPTY_INPUT, type Input, type Operative } from "./types";
import type { Battlefield } from "./scene";
export function screenToWorld(x: number, y: number) {
  return { x: x * 0.795 + y * 0.606, z: -x * 0.606 + y * 0.795 };
}
export class Controls {
  enabled = false;
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, active: false, shoot: false };
  private move = { x: 0, y: 0 };
  private aim = { x: 0, y: 0, active: false };
  private dash = 0;
  private seq = 0;
  private interact = false;
  private reload = false;
  private lastAim = { x: 0, z: -1 };
  private gamepadDash = false;
  constructor(
    private canvas: HTMLCanvasElement,
    private view: Battlefield,
  ) {
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("blur", this.blur);
    canvas.addEventListener("pointerdown", this.pointerdown);
    window.addEventListener("pointerup", this.pointerup);
    window.addEventListener("pointermove", this.pointermove);
    canvas.addEventListener("contextmenu", this.contextmenu);
  }
  private keydown = (e: KeyboardEvent) => {
    if (
      !this.enabled ||
      (e.target instanceof HTMLElement && e.target.closest("input,textarea"))
    )
      return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Space",
        "KeyE",
        "KeyR",
      ].includes(e.code)
    ) {
      e.preventDefault();
      this.keys.add(e.code);
      if (e.code === "Space" && !e.repeat) this.dash++;
    }
  };
  private keyup = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private pointerdown = (e: PointerEvent) => {
    if (this.enabled && e.pointerType === "mouse" && e.button === 0) {
      this.mouse.shoot = true;
      this.mouse.active = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    }
  };
  private pointerup = (e: PointerEvent) => {
    if (e.pointerType === "mouse") this.mouse.shoot = false;
  };
  private pointermove = (e: PointerEvent) => {
    if (e.pointerType === "mouse") {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.active = true;
    }
  };
  private contextmenu = (e: Event) => e.preventDefault();
  private blur = () => this.reset();
  reset() {
    this.keys.clear();
    this.mouse.shoot = false;
    this.move = { x: 0, y: 0 };
    this.aim.active = false;
    this.interact = false;
    this.reload = false;
  }
  stick(kind: "move" | "aim", x: number, y: number, active = true) {
    if (kind === "move") this.move = { x, y };
    else this.aim = { x, y, active };
  }
  action(kind: "dash" | "interact" | "reload", down: boolean) {
    if (kind === "dash") {
      if (down) this.dash++;
    } else if (kind === "interact") this.interact = down;
    else this.reload = down;
  }
  read(player: Operative): Input {
    if (!this.enabled)
      return { ...EMPTY_INPUT, dash: this.dash, seq: ++this.seq };
    const has = (...keys: string[]) => keys.some((k) => this.keys.has(k));
    let sx =
      (has("KeyD", "ArrowRight") ? 1 : 0) -
      (has("KeyA", "ArrowLeft") ? 1 : 0) +
      this.move.x;
    let sy =
      (has("KeyS", "ArrowDown") ? 1 : 0) -
      (has("KeyW", "ArrowUp") ? 1 : 0) +
      this.move.y;
    let shoot = this.mouse.shoot,
      interact = has("KeyE") || this.interact,
      reload = has("KeyR") || this.reload;
    let pad: Gamepad | null | undefined;
    try { pad = navigator.getGamepads?.().find((p) => p?.connected); } catch { /* Embedded/mobile browsers can deny gamepad access. Other controls still work. */ }
    if (pad) {
      if (Math.hypot(pad.axes[0] ?? 0, pad.axes[1] ?? 0) > 0.16) {
        sx += pad.axes[0] ?? 0;
        sy += pad.axes[1] ?? 0;
      }
      if (Math.hypot(pad.axes[2] ?? 0, pad.axes[3] ?? 0) > 0.2) {
        this.lastAim = screenToWorld(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
        this.mouse.active = false;
      }
      shoot ||= !!pad.buttons[7]?.pressed;
      interact ||= !!pad.buttons[3]?.pressed;
      reload ||= !!pad.buttons[2]?.pressed;
      if (pad.buttons[0]?.pressed && !this.gamepadDash) this.dash++;
      this.gamepadDash = !!pad.buttons[0]?.pressed;
    }
    if (this.aim.active && Math.hypot(this.aim.x, this.aim.y) > 0.12) {
      this.lastAim = screenToWorld(this.aim.x, this.aim.y);
      shoot = true;
    } else if (this.mouse.active) {
      const p = this.view.groundPoint(this.mouse.x, this.mouse.y);
      if (p && Math.hypot(p.x - player.x, p.z - player.z) > 0.1)
        this.lastAim = { x: p.x - player.x, z: p.z - player.z };
    }
    const move = screenToWorld(sx, sy),
      m = Math.max(1, Math.hypot(move.x, move.z)),
      a = Math.max(0.001, Math.hypot(this.lastAim.x, this.lastAim.z));
    return {
      mx: move.x / m,
      mz: move.z / m,
      ax: this.lastAim.x / a,
      az: this.lastAim.z / a,
      shoot,
      interact,
      reload,
      dash: this.dash,
      seq: ++this.seq,
    };
  }
  dispose() {
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("blur", this.blur);
    this.canvas.removeEventListener("pointerdown", this.pointerdown);
    window.removeEventListener("pointerup", this.pointerup);
    window.removeEventListener("pointermove", this.pointermove);
    this.canvas.removeEventListener("contextmenu", this.contextmenu);
  }
}
