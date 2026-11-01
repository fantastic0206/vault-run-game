/** Keep a joystick's thumb inside its actual rendered ring, in either orientation. */
export function stickVector(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number) {
  const size = Math.min(rect.width, rect.height);
  const travel = Math.max(1, size * .3 - 4);
  const dx = (clientX - rect.left - rect.width / 2) / travel;
  const dy = (clientY - rect.top - rect.height / 2) / travel;
  const length = Math.max(1, Math.hypot(dx, dy));
  return { x: dx / length, y: dy / length, offsetX: dx / length * travel, offsetY: dy / length * travel };
}

/** Each finger owns one control; another finger lifting must not release that control. */
export class TouchPointers {
  private held = new Map<string, number>();
  claim(control: string, id: number) {
    if (this.held.has(control) || [...this.held.values()].includes(id)) return false;
    this.held.set(control, id); return true;
  }
  release(control: string, id: number) {
    if (this.held.get(control) !== id) return false;
    this.held.delete(control); return true;
  }
  clear() { this.held.clear(); }
}
