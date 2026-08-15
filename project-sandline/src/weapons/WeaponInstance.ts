// Per-owner weapon state machine: HOLSTERED -> DRAWING -> READY, with
// FIRING / COOLDOWN timestamps, RELOADING, and semi/auto/burst fire modes.
// All transitions are timestamp driven (design doc 11.3). No rendering,
// no input - pure simulation.

import { clamp, vec3, Vec3 } from '../core/math';
import type { RNG } from '../core/RNG';
import type { CollisionWorld } from '../world/CollisionWorld';
import type { WeaponSpec } from './WeaponRegistry';

export type WeaponState = 'holstered' | 'drawing' | 'ready' | 'firing' | 'cooldown' | 'reloading';

export interface FireContext {
  now: number;
  rng: RNG;
  world: CollisionWorld;
  /** Muzzle origin. */
  origin: Vec3;
  /** View forward / right / up. */
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  isCrouching: boolean;
  isAirborne: boolean;
  /** Current horizontal speed in m/s. */
  moveSpeed: number;
  /** Current maximum speed for the movement penalty factor (0..1). */
  maxSpeed: number;
  /** True when the owner is zoomed in. */
  zoomed: boolean;
  /** Current zoom level index (0 = no zoom). */
  zoomLevel: number;
  /** True when the owner is currently moving upward (jump spread). */
  velYUp?: boolean;
  /** Resolve a fired shot direction; called once per pellet. */
  resolveShot: (dir: Vec3) => void;
  /** Callback when the shot consumed ammo and happened (for sounds/events). */
  onFired?: (spec: WeaponSpec) => void;
}

export class WeaponInstance {
  spec: WeaponSpec;
  mag: number;
  reserve: number;
  state: WeaponState = 'holstered';
  /** Timestamp (ms) when the current state completes. */
  stateEndsAt = 0;
  nextFireAt = 0;
  private burstRemaining = 0;
  private lastShotAt = 0;
  private triggerDown = false;
  /** Current fire mode index into spec.fireModes. */
  fireModeIndex = 0;
  /** Current extra spread (radians) from firing, decays over time. */
  spreadExtra = 0;
  /** Current recoil punch pitch (radians) applied to the owner's view. */
  recoilPitch = 0;
  /** Current recoil punch yaw (radians). */
  recoilYaw = 0;

  constructor(spec: WeaponSpec, fullAmmo = true) {
    this.spec = spec;
    this.mag = fullAmmo ? spec.magazineSize : 0;
    this.reserve = fullAmmo ? spec.reserveAmmoMax : 0;
    if (spec.fireModes.length === 0) spec.fireModes = ['semi'];
  }

  get fireMode(): string {
    return this.spec.fireModes[this.fireModeIndex];
  }

  get canFire(): boolean {
    return this.state === 'ready' && this.mag > 0;
  }

  get isReloading(): boolean {
    return this.state === 'reloading';
  }

  cycleFireMode(now: number): void {
    if (this.spec.fireModes.length <= 1) return;
    this.fireModeIndex = (this.fireModeIndex + 1) % this.spec.fireModes.length;
    this.state = 'cooldown';
    this.stateEndsAt = now + Math.min(this.spec.fireIntervalMs, 300);
  }

  draw(now: number): void {
    if (this.state === 'drawing') return;
    this.state = 'drawing';
    this.stateEndsAt = now + this.spec.drawMs;
    this.burstRemaining = 0;
  }

  holster(): void {
    this.state = 'holstered';
    this.burstRemaining = 0;
  }

  reload(now: number): boolean {
    if (this.state === 'reloading') return false;
    if (this.mag >= this.spec.magazineSize) return false;
    if (this.reserve <= 0) return false;
    if (this.spec.reloadMs <= 0) {
      this.transferAmmo();
      return true;
    }
    this.state = 'reloading';
    this.stateEndsAt = now + this.spec.reloadMs;
    this.burstRemaining = 0;
    return true;
  }

  /** Cancel an in-progress reload (e.g. weapon switch). No ammo transfer. */
  cancelReload(): void {
    if (this.state === 'reloading') this.state = 'ready';
  }

  private transferAmmo(): void {
    const need = this.spec.magazineSize - this.mag;
    const take = Math.min(need, this.reserve);
    this.mag += take;
    this.reserve -= take;
  }

  /**
   * Attempt to fire. Returns true when a shot happened. Semi mode requires
   * the trigger to be released between shots (caller passes firePressed).
   */
  tryFire(ctx: FireContext, firePressed: boolean): boolean {
    const { now } = ctx;
    const edge = firePressed && !this.triggerDown;
    this.triggerDown = firePressed;
    if (this.state === 'reloading' || this.state === 'holstered') return false;
    if (this.state === 'drawing' && now < this.stateEndsAt) return false;
    if (now < this.nextFireAt) return false;
    if (this.mag <= 0) return false;
    if (this.spec.throwable) return false; // grenades thrown via a dedicated path

    const mode = this.fireMode;
    if (mode === 'semi' && !edge) return false;

    if (mode === 'burst') {
      if (this.burstRemaining <= 0) {
        if (!edge) return false;
        this.burstRemaining = this.spec.burstCount;
      }
      this.burstRemaining--;
    }

    if (this.state !== 'ready') {
      // Allow firing from READY only; cooldown handled by nextFireAt.
      if (this.state === 'cooldown') this.state = 'ready';
    }
    this.state = 'firing';
    this.mag -= 1;
    this.lastShotAt = now;
    this.nextFireAt = now + this.spec.fireIntervalMs;

    // Recoil + spread growth.
    const r = this.spec.recoil;
    this.recoilPitch += (r.verticalRise * Math.PI) / 180;
    this.recoilYaw += (r.horizontalRange * (ctx.rng.next() * 2 - 1) * Math.PI) / 180;
    this.spreadExtra = Math.min(r.maxSpread, this.spreadExtra + r.spreadGrowth);

    // Resolve pellets.
    const pellets = this.spec.pellets;
    const spreadRad = this.currentSpreadRadians(ctx);
    for (let i = 0; i < pellets; i++) {
      const dir = ctx.rng.coneDir(ctx.forward, (spreadRad * 180) / Math.PI);
      ctx.resolveShot(vec3(dir.x, dir.y, dir.z));
    }

    if (mode !== 'burst' || this.burstRemaining <= 0) {
      this.state = 'cooldown';
    }
    ctx.onFired?.(this.spec);
    return true;
  }

  /** Current total spread cone half-angle in radians. */
  currentSpreadRadians(ctx: FireContext): number {
    const s = this.spec;
    let spread = s.baseSpread;
    // Movement penalty scales with speed fraction.
    const speedFrac = ctx.maxSpeed > 0.001 ? clamp(ctx.moveSpeed / ctx.maxSpeed, 0, 1) : 1;
    spread += s.movementSpread * speedFrac;
    if (ctx.isAirborne) {
      spread = Math.max(spread, s.airSpread);
      if (ctx.velYUp === true) spread = Math.max(spread, s.jumpSpread);
    }
    if (ctx.isCrouching) spread *= s.crouchSpreadScale;
    spread += this.spreadExtra;
    // Zoom: scoped weapons become far more accurate.
    if (ctx.zoomed && s.zoomLevels.length > 1) {
      const baseZoomSpread = s.baseSpread * s.zoomSpreadScale;
      spread = ctx.moveSpeed < 0.5 ? Math.min(spread, baseZoomSpread) : Math.max(spread, s.airSpread);
    }
    return clamp(spread, 0, Math.PI / 3);
  }

  update(now: number, dt: number): void {
    const ms = dt * 1000;
    if (this.state === 'drawing' && now >= this.stateEndsAt) {
      this.state = 'ready';
    }
    if (this.state === 'reloading' && now >= this.stateEndsAt) {
      this.transferAmmo();
      this.state = 'ready';
    }
    // Recoil recovery.
    const r = this.spec.recoil;
    const rec = (r.recoveryDegPerSec * Math.PI) / 180 * (ms / 1000);
    this.recoilPitch = Math.max(0, this.recoilPitch - rec);
    this.recoilYaw = clamp(this.recoilYaw - Math.sign(this.recoilYaw) * rec, -0.2, 0.2);
    if (Math.abs(this.recoilYaw) < 0.001) this.recoilYaw = 0;
    // Spread recovery.
    this.spreadExtra = Math.max(0, this.spreadExtra - r.spreadDecayPerSec * (ms / 1000));
  }

  /** Total view punch (radians) - pitch is always upward. */
  viewPunch(): { pitch: number; yaw: number } {
    return { pitch: this.recoilPitch, yaw: this.recoilYaw };
  }
}
