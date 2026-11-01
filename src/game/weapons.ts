export type WeaponId = 0 | 1 | 2 | 3;
export const WEAPONS = [
  { name: "PULSE CARBINE", short: "PULSE", description: "Accurate, quick and dependable", damage: 28, pellets: 1, spread: 0, magazine: 24, reload: .85, fire: .11, speed: 36, life: 1.25, splash: 0, color: "#74edcf" },
  { name: "THUNDER SHOTGUN", short: "THUNDER", description: "Seven pellets. Clears close threats.", damage: 20, pellets: 7, spread: .075, magazine: 8, reload: 1, fire: .52, speed: 31, life: .58, splash: 0, color: "#ffbb73" },
  { name: "CYCLONE MINIGUN", short: "CYCLONE", description: "Rapid fire with a huge magazine", damage: 24, pellets: 1, spread: .035, magazine: 90, reload: 1.2, fire: .055, speed: 39, life: 1.12, splash: 0, color: "#e2b4ff" },
  { name: "NOVA CANNON", short: "NOVA", description: "Strongest · Massive damage + splash", damage: 260, pellets: 1, spread: 0, magazine: 12, reload: .95, fire: .36, speed: 32, life: 1.45, splash: 2.8, color: "#88dcff" },
] as const;
export const DEFAULT_WEAPON: WeaponId = 3;
export function isWeapon(value: unknown): value is WeaponId { return Number.isInteger(value) && Number(value) >= 0 && Number(value) < WEAPONS.length; }
