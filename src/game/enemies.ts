import type { EnemyType } from "./types";

export const ENEMIES: Record<EnemyType, { name: string; humanoid: boolean; hp: number; speed: number; range: number; rate: number; damage: number; projectile: number; spread: number[]; weapon: 0 | 1 | 2; color: number }> = {
  drone: { name: "SENTRY DRONE", humanoid: false, hp: 48, speed: 3.2, range: 7, rate: 1.5, damage: 14, projectile: 12, spread: [0], weapon: 0, color: 0xff805f },
  heavy: { name: "ARMORED DRONE", humanoid: false, hp: 90, speed: 2.1, range: 8, rate: 1.4, damage: 18, projectile: 12, spread: [-.14, 0, .14], weapon: 1, color: 0xffb770 },
  hunter: { name: "HUNTER", humanoid: false, hp: 36, speed: 4.4, range: 3.5, rate: .85, damage: 14, projectile: 15, spread: [0], weapon: 0, color: 0xe49bff },
  guard: { name: "SECURITY RIFLEMAN", humanoid: true, hp: 65, speed: 3.4, range: 10, rate: 1.05, damage: 14, projectile: 17, spread: [0], weapon: 0, color: 0xff7970 },
  raider: { name: "BREACHER", humanoid: true, hp: 80, speed: 4.1, range: 4.5, rate: 1.7, damage: 10, projectile: 15, spread: [-.2, -.1, 0, .1, .2], weapon: 1, color: 0xffb268 },
  marksman: { name: "MARKSMAN", humanoid: true, hp: 46, speed: 2.9, range: 17, rate: 2.5, damage: 26, projectile: 24, spread: [0], weapon: 0, color: 0xcb9cff },
  juggernaut: { name: "JUGGERNAUT", humanoid: true, hp: 180, speed: 1.9, range: 11, rate: .55, damage: 12, projectile: 16, spread: [-.045, .045], weapon: 2, color: 0xff6248 },
};
export const ENEMY_TYPES = Object.keys(ENEMIES) as EnemyType[];
