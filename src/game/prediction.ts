import { blocked, clearShot, slideMove } from "./map";
import { projectiles, stepPlayer } from "./player";
import type { Input, Operative, PlayerCommand, Projectile, World } from "./types";

const copyPlayer = (p: Operative): Operative => ({ ...p, magazines: [...p.magazines] });
interface PredictedShot { bullet: Projectile; at: number; count: number }

/** Unacknowledged input is replayed over each host correction, never applied twice on the host. */
export class LocalPrediction {
  player: Operative;
  pending: PlayerCommand[] = [];
  private shots = new Map<string, PredictedShot>();
  private retired = new Set<string>();
  private nextId = -1;
  constructor(p: Operative, readonly stream: string) { this.player = copyPlayer(p); this.player.inputStream = stream; }
  advance(input: Input, dt: number, now: number, world: World) {
    if (this.pending.length >= 180 || world.status !== "playing") return false;
    const command = { input: { ...input }, dt };
    this.pending.push(command);
    const event = stepPlayer(this.player, command.input, dt, world.relays.every(r => r.done), world.core.carrier === this.player.id);
    if (event.shot) for (const bullet of projectiles(this.player, world.time, () => this.nextId--)) this.shots.set(bullet.shot!, { bullet, at: now, count: this.player.shots });
    return event.shot;
  }
  reconcile(world: World) {
    const p = world.players.find(p => p.id === this.player.id);
    if (!p) return;
    if (p.inputStream === this.stream) {
      this.pending = this.pending.filter(command => command.input.seq > p.lastInput);
      const present = new Set(world.bullets.map(b => b.shot));
      for (const [key, shot] of this.shots) if (shot.count <= p.shots && !present.has(key)) { this.shots.delete(key); this.retired.add(key); }
    }
    this.player = copyPlayer(p); this.player.inputStream = this.stream;
    for (const command of this.pending) stepPlayer(this.player, command.input, command.dt, world.relays.every(r => r.done), world.core.carrier === p.id);
    if (this.retired.size > 400) this.retired = new Set([...this.retired].slice(-200));
  }
  renderBullets(now: number, open: boolean): Projectile[] {
    const result: Projectile[] = [];
    for (const [key, shot] of this.shots) {
      const bullet = advanceBullet(shot.bullet, Math.max(0, (now - shot.at) / 1000), open);
      if (bullet) result.push(bullet);
      else { this.shots.delete(key); this.retired.add(key); }
    }
    return result;
  }
  ownsShot(key: string | undefined) { return !!key && (this.shots.has(key) || this.retired.has(key)); }
}

export function advanceBullet(b: Projectile, age: number, open: boolean): Projectile | null {
  if (age >= b.life) return null;
  const to = { x: b.x + b.vx * age, z: b.z + b.vz * age };
  if (blocked(to.x, to.z, .07, open) || !clearShot(b, to, open)) return null;
  return { ...b, ...to, life: b.life - age };
}

interface Snapshot { world: World; at: number }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Short actor interpolation buffer; projectiles keep moving independently of packet arrivals. */
export class Presentation {
  private frames: Snapshot[] = [];
  private tracks = new Map<number, { bullet: Projectile; at: number }>();
  private offset: number | null = null;
  private cursor: number | null = null;
  private sampleAt = 0;
  clear() { this.frames = []; this.tracks.clear(); this.offset = this.cursor = null; this.sampleAt = 0; }
  push(world: World, at: number) {
    const last = this.frames.at(-1);
    if (last && world.tick <= last.world.tick && world.status === last.world.status) return;
    const offset = at / 1000 - world.time;
    if (this.offset === null || Math.abs(offset - this.offset) > 2) { this.clear(); this.offset = offset; }
    else this.offset += (offset - this.offset) * .06;
    this.frames.push({ world: structuredClone(world), at });
    if (this.frames.length > 12) this.frames.shift();
    const ids = new Set(world.bullets.map(b => b.id));
    for (const id of this.tracks.keys()) if (!ids.has(id)) this.tracks.delete(id);
    for (const bullet of world.bullets) if (!this.tracks.has(bullet.id)) this.tracks.set(bullet.id, { bullet: { ...bullet }, at });
  }
  sample(now: number, self: Operative | undefined, prediction?: LocalPrediction): World | null {
    const newest = this.frames.at(-1); if (!newest) return null;
    const elapsed = Math.max(0, (now - newest.at) / 1000), latest = newest.world;
    const desired = now / 1000 - this.offset! - .075;
    if (this.cursor === null) this.cursor = desired;
    else {
      const dt = Math.max(0, Math.min(.1, (now - this.sampleAt) / 1000));
      const next = this.cursor + dt;
      // Jitter adjusts the presentation clock gradually; it must never rewind an actor.
      this.cursor = Math.max(this.cursor, Math.min(latest.time + .15, next + Math.max(-dt * .15, Math.min(dt * .15, (desired - next) * .12))));
    }
    this.sampleAt = now;
    const target = this.cursor;
    let a = this.frames[0].world, b = a;
    for (const snapshot of this.frames) {
      if (snapshot.world.time <= target) a = snapshot.world;
      b = snapshot.world;
      if (b.time >= target) break;
    }
    const t = b.time > a.time ? Math.max(0, Math.min(1, (target - a.time) / (b.time - a.time))) : 1;
    const extra = Math.max(0, Math.min(.15, target - b.time));
    const open = latest.relays.every(r => r.done);
    const pose = <T extends { id: string | number; x: number; z: number; angle: number; vx?: number; vz?: number }>(p: T, aa: T[], bb: T[]): T => {
      const from = aa.find(q => q.id === p.id) ?? p, to = bb.find(q => q.id === p.id) ?? p;
      const result = { ...p, x: lerp(from.x, to.x, t), z: lerp(from.z, to.z, t), angle: angle(from.angle, to.angle, t) };
      if (extra) slideMove(result, (to.vx || 0) * extra, (to.vz || 0) * extra, .42, open);
      return result;
    };
    const bullets = latest.bullets.filter(bullet => !prediction?.ownsShot(bullet.shot)).map(bullet => {
      const track = this.tracks.get(bullet.id)!;
      return advanceBullet(track.bullet, Math.max(0, (now - track.at) / 1000), open);
    }).filter((bullet): bullet is Projectile => !!bullet);
    if (prediction) bullets.push(...prediction.renderBullets(now, open));
    const players = latest.players.map(p => p.id === self?.id ? copyPlayer(self) : pose(p, a.players, b.players));
    const carrier = players.find(p => p.id === latest.core.carrier);
    return { ...latest, players, enemies: latest.enemies.map(e => pose(e, a.enemies, b.enemies)), bullets,
      time: latest.time + Math.min(.7, elapsed), core: carrier ? { ...latest.core, x: carrier.x, z: carrier.z } : latest.core };
  }
}
