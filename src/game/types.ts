import type { WeaponId } from "./weapons.js";
export interface Vec2 {
  x: number;
  z: number;
}
export interface Obstacle extends Vec2 {
  w: number;
  d: number;
  h: number;
  kind: "crate" | "wall" | "pillar" | "door";
}
export interface Input {
  mx: number;
  mz: number;
  ax: number;
  az: number;
  shoot: boolean;
  interact: boolean;
  reload: boolean;
  dash: number;
  seq: number;
  weapon: WeaponId | -1;
}
export interface Operative extends Vec2 {
  id: string;
  name: string;
  color: number;
  angle: number;
  health: number;
  shield: number;
  ammo: number;
  weapon: WeaponId;
  magazines: number[];
  reload: number;
  fire: number;
  dashTime: number;
  dashCooldown: number;
  lastDash: number;
  hurt: number;
  invulnerable: number;
  moving: number;
  kills: number;
  revive: number;
  lastInput: number;
}
export interface Enemy extends Vec2 {
  id: number;
  angle: number;
  hp: number;
  type: "drone" | "heavy" | "hunter";
  fire: number;
  path: Vec2[];
  pathTime: number;
  hurt: number;
}
export interface Projectile extends Vec2 {
  id: number;
  vx: number;
  vz: number;
  life: number;
  enemy: boolean;
  owner: string;
  damage: number;
  weapon?: WeaponId;
  splash?: number;
}
export interface Relay extends Vec2 {
  id: number;
  progress: number;
  done: boolean;
}
export interface Pickup extends Vec2 {
  id: number;
  active: boolean;
  respawn: number;
}
export interface Effect extends Vec2 {
  id: number;
  t: number;
  kind: "hit" | "explosion" | "nova" | "hack" | "heal" | "dash";
}
export type Difficulty = "casual" | "tactical" | "lockdown" | "nightmare";
export interface SecurityStrike extends Vec2 {
  id: number;
  born: number;
  delay: number;
  radius: number;
  hit: boolean;
}
export const PROTOCOL = 3;
export interface World {
  version: number;
  difficulty: Difficulty;
  tick: number;
  time: number;
  status: "playing" | "won" | "lost" | "aborted";
  reason: string;
  players: Operative[];
  enemies: Enemy[];
  bullets: Projectile[];
  relays: Relay[];
  pickups: Pickup[];
  effects: Effect[];
  hazards: SecurityStrike[];
  strikeTimer: number;
  core: { x: number; z: number; carrier: string | null };
  nextId: number;
  spawnTimer: number;
  kills: number;
  extraction: number;
  seed: number;
}
export interface Hint {
  text: string;
  progress: number;
  key: string;
}
export interface Seat {
  id: string;
  name: string;
  color: number;
  online: boolean;
  left?: boolean;
}
export interface Room {
  code: string;
  version: number;
  gameId: string;
  hostId: string;
  phase: "lobby" | "playing" | "finished";
  difficulty: Difficulty;
  selfId: string;
  players: Seat[];
  result: "won" | "lost" | "aborted" | null;
}
export interface Session {
  code: string;
  token: string;
  id: string;
}
export const EMPTY_INPUT: Input = {
  mx: 0,
  mz: 0,
  ax: 0,
  az: -1,
  shoot: false,
  interact: false,
  reload: false,
  dash: 0,
  seq: 0,
  weapon: -1,
};
export const COLORS = ["#f2c879", "#65dbc9", "#ba9cf1", "#f89179"];
