import { slideMove } from "./map";
import type { Input, Operative, Projectile } from "./types";
import { isWeapon, WEAPONS } from "./weapons";

export const STEP = 1 / 60;
export const WALK_SPEED = 6.7;
export interface PlayerStep { shot: boolean; dash: boolean }

/** Shared by authoritative simulation and local prediction. No damage or world mutation. */
export function stepPlayer(p: Operative, input: Input, dt: number, open: boolean, carrying: boolean): PlayerStep {
  const result = { shot: false, dash: false };
  p.lastInput = input.seq;
  p.fire = Math.max(0, p.fire - dt);
  p.flash = Math.max(0, p.flash - dt);
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  p.dashTime = Math.max(0, p.dashTime - dt);
  p.vx = p.vz = p.moving = 0;
  if (p.health <= 0) return result;
  if (isWeapon(input.weapon) && input.weapon !== p.weapon) {
    p.magazines[p.weapon] = p.ammo;
    p.weapon = input.weapon;
    p.ammo = p.magazines[p.weapon];
    p.reload = 0;
    p.fire = Math.max(.16, p.fire);
  }
  const weapon = WEAPONS[p.weapon], len = Math.max(1, Math.hypot(input.mx, input.mz));
  const mx = input.mx / len, mz = input.mz / len;
  const aim = Math.hypot(input.ax, input.az);
  const ax = aim > .1 ? input.ax / aim : Math.sin(p.angle), az = aim > .1 ? input.az / aim : Math.cos(p.angle);
  p.angle = Math.atan2(ax, az);
  p.moving = Math.hypot(mx, mz);
  if (input.dash > p.lastDash) {
    p.lastDash = input.dash;
    if (p.dashCooldown <= 0 && p.moving > .05) {
      p.dashTime = .18; p.dashCooldown = 2.4; p.invulnerable = .26; result.dash = true;
    }
  }
  const speed = p.dashTime > 0 ? 22 : carrying ? 5.4 : WALK_SPEED;
  const x = p.x, z = p.z;
  slideMove(p, mx * speed * dt, mz * speed * dt, .42, open);
  p.vx = (p.x - x) / dt; p.vz = (p.z - z) / dt;
  if (p.reload > 0) {
    p.reload = Math.max(0, p.reload - dt);
    if (!p.reload) p.ammo = weapon.magazine;
  }
  if (!p.reload && ((input.reload && p.ammo < weapon.magazine) || p.ammo === 0)) p.reload = weapon.reload;
  if (input.shoot && p.fire <= 1e-8 && !p.reload && p.ammo > 0) {
    p.ammo--; p.fire = weapon.fire; p.shots++; p.flash = .07; result.shot = true;
  }
  p.magazines[p.weapon] = p.ammo;
  return result;
}

/** Shot directions and IDs are identical on host and shooter, including spread. */
export function projectiles(p: Operative, born: number, nextId: () => number): Projectile[] {
  const weapon = WEAPONS[p.weapon];
  return Array.from({ length: weapon.pellets }, (_, i) => {
    let hash = Math.imul(p.shots + 1, 0x45d9f3b) ^ Math.imul(i + 17, 0x27d4eb2d);
    hash ^= hash >>> 16;
    const offset = weapon.pellets > 1 ? (i - (weapon.pellets - 1) / 2) * weapon.spread : ((hash >>> 0) / 4294967296 - .5) * weapon.spread;
    const angle = p.angle + offset;
    return { id: nextId(), x: p.x + Math.sin(p.angle) * .8, z: p.z + Math.cos(p.angle) * .8,
      vx: Math.sin(angle) * weapon.speed, vz: Math.cos(angle) * weapon.speed, life: weapon.life,
      enemy: false, owner: p.id, damage: weapon.damage, weapon: p.weapon, splash: weapon.splash,
      shot: `${p.id}:${p.inputStream}:${p.shots}:${i}`, born };
  });
}
