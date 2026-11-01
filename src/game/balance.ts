import type { Difficulty } from "./types.js";

export const DIFFICULTIES = {
  casual: { name: "CASUAL", subtitle: "Recommended · Big guns. Gentle security. Have fun.", hp: .65, damage: .45, speed: .72, spawn: 1.8, hack: 1.5, extract: 2, strike: 18, guards: 0, perimeter: false, cap: 8, medkit: 20 },
  tactical: { name: "TACTICAL", subtitle: "A little more action, still forgiving.", hp: .9, damage: .75, speed: .9, spawn: 1.2, hack: 2, extract: 3, strike: 12, guards: 1, perimeter: true, cap: 14, medkit: 35 },
  lockdown: { name: "LOCKDOWN", subtitle: "Hard · Hunters and frequent strikes.", hp: 1.3, damage: 1.3, speed: 1.16, spawn: .76, hack: 4.2, extract: 6, strike: 6.5, guards: 4, perimeter: true, cap: 22, medkit: 55 },
  nightmare: { name: "NIGHTMARE", subtitle: "Extreme · Bring a coordinated crew.", hp: 1.55, damage: 1.6, speed: 1.3, spawn: .6, hack: 5, extract: 8, strike: 4.8, guards: 6, perimeter: true, cap: 22, medkit: 55 },
} as const;
export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && Object.hasOwn(DIFFICULTIES, value);
}
export const HACK_SECONDS = (difficulty: Difficulty) => DIFFICULTIES[difficulty].hack;
export const EXTRACT_SECONDS = (difficulty: Difficulty) => DIFFICULTIES[difficulty].extract;
