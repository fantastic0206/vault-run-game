import type { Difficulty } from "./types.js";

export const DIFFICULTIES = {
  tactical: { name: "TACTICAL", subtitle: "Learn the route. Keep moving.", hp: 1, damage: 1, speed: 1, spawn: 1, hack: 3, extract: 4, strike: 9, guards: 2 },
  lockdown: { name: "LOCKDOWN", subtitle: "Hunters. Airstrikes. No free exits.", hp: 1.3, damage: 1.3, speed: 1.16, spawn: 0.76, hack: 4.2, extract: 6, strike: 6.5, guards: 4 },
  nightmare: { name: "NIGHTMARE", subtitle: "A coordinated crew is your best chance.", hp: 1.55, damage: 1.6, speed: 1.3, spawn: 0.6, hack: 5, extract: 8, strike: 4.8, guards: 6 },
} as const;
export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && Object.hasOwn(DIFFICULTIES, value);
}
export const HACK_SECONDS = (difficulty: Difficulty) => DIFFICULTIES[difficulty].hack;
export const EXTRACT_SECONDS = (difficulty: Difficulty) => DIFFICULTIES[difficulty].extract;
