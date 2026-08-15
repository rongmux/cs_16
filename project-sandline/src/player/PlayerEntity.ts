// Player entity: movement + view + health/armor + weapon inventory + commands.
// Pure simulation (no three.js); used by the human player, bots, and dummies.

import { Vec3, vec3, yawPitchForward, yawRight, distXZ } from '../core/math';
import type { RNG } from '../core/RNG';
import type { EventBus, HitRegion, TeamId, WeaponSlotId } from '../core/EventBus';
import type { CollisionWorld } from '../world/CollisionWorld';
import { CharacterMotor, MoveInput } from './CharacterMotor';
import { movement } from '../world/DataFiles';
import { WeaponRegistry, WeaponSpec } from '../weapons/WeaponRegistry';
import { WeaponInstance } from '../weapons/WeaponInstance';
import { bodyHeight, HitboxSource } from '../combat/Hitbox';
import { ArmorState } from '../combat/Damage';

export interface PlayerCommand {
  forward: number;
  right: number;
  run: boolean;
  crouch: boolean;
  jump: boolean;
  /** Trigger held. */
  fire: boolean;
  /** Edge-triggered reload. */
  reload: boolean;
  /** Edge-triggered zoom toggle. */
  altFire: boolean;
  /** Edge-triggered fire mode switch. */
  fireModeSwitch: boolean;
  /** Edge-triggered slot switch request. */
  switchSlot: WeaponSlotId | null;
  /** Use held (plant/defuse progress). */
  use: boolean;
  /** Use pressed this tick (pickup). */
  usePressed: boolean;
  /** Grenade throw held (charge). */
  throwGrenade: boolean;
  /** Optional preset power for bots (0..1). */
  grenadePower?: number;
}

export interface UpdateContext {
  now: number;
  rng: RNG;
  world: CollisionWorld;
  eventBus: EventBus;
  /** Movement allowed (false during freeze / after death). */
  canMove: boolean;
  /** Firing allowed. */
  canFire: boolean;
  /** Resolve a fired pellet (hit detection + damage). */
  resolveShot: (shooter: PlayerEntity, spec: WeaponSpec, origin: Vec3, dir: Vec3) => void;
  /** Spawn a thrown grenade. */
  throwGrenade: (shooter: PlayerEntity, spec: WeaponSpec, power: number, dir: Vec3) => void;
  /** Use pressed: pickup/interact resolution. */
  onUse: (player: PlayerEntity) => void;
}

export interface Inventory {
  primary: string | null;
  secondary: string | null;
  hasBomb: boolean;
  defuseKit: boolean;
}

const SLOT_ORDER: WeaponSlotId[] = ['primary', 'secondary', 'knife', 'grenade', 'objective'];

export class PlayerEntity implements HitboxSource {
  id: number;
  name: string;
  team: TeamId;
  isBot: boolean;
  motor: CharacterMotor;
  yaw = 0;
  pitch = 0;
  health = 100;
  armor = 0;
  helmet = false;
  money = 0;
  alive = true;
  kills = 0;
  deaths = 0;
  inventory: Inventory = { primary: null, secondary: null, hasBomb: false, defuseKit: false };
  weapons = new Map<string, WeaponInstance>();
  activeSlot: WeaponSlotId = 'knife';
  zoomIndex = 0;
  /** Number of consecutive rounds lost (economy loss bonus). */
  lossStreak = 0;
  /** Last attacker (bots react to damage). */
  lastAttackerId: number | null = null;
  lastDamageAt = -999;
  /** Time (s) since spawn, for stats. */
  private throwCharge = 0;
  private footstepAccum = 0;
  /** Emitted from damage handling (set by match). */
  onDeath: ((player: PlayerEntity) => void) | null = null;
  /** Allowed to plant/defuse/etc. Set by match per round state. */
  canUseObjectives = true;

  constructor(
    id: number,
    name: string,
    team: TeamId,
    isBot: boolean,
    private registry: WeaponRegistry,
  ) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.isBot = isBot;
    this.motor = new CharacterMotor(movement);
  }

  get pos(): Vec3 {
    return this.motor.pos;
  }

  get crouching(): boolean {
    return this.motor.crouching;
  }

  get standingHeight(): number {
    return movement.standingHeight;
  }

  get crouchingHeight(): number {
    return movement.crouchingHeight;
  }

  get radius(): number {
    return movement.capsuleRadius;
  }

  eyePos(): Vec3 {
    return this.motor.eyePos();
  }

  viewForward(): Vec3 {
    return yawPitchForward(this.yaw, this.pitch);
  }

  viewRight(): Vec3 {
    return yawRight(this.yaw);
  }

  activeWeapon(): WeaponInstance | null {
    return this.weapons.get(this.activeWeaponId()) ?? null;
  }

  private activeWeaponId(): string {
    switch (this.activeSlot) {
      case 'primary':
        return this.inventory.primary ?? 'knife';
      case 'secondary':
        return this.inventory.secondary ?? 'knife';
      case 'knife':
        return 'knife';
      case 'grenade': {
        const g = this.inventoryGrenadeId();
        return g ?? 'knife';
      }
      case 'objective':
        return this.inventory.hasBomb ? 'objective_device' : 'knife';
      default:
        return 'knife';
    }
  }

  private inventoryGrenadeId(): string | null {
    for (const w of this.weapons.values()) {
      if (w.spec.slot === 'grenade' && w.mag > 0) return w.spec.id;
    }
    return null;
  }

  grenadeCount(id: string): number {
    return this.weapons.get(id)?.mag ?? 0;
  }

  giveWeapon(id: string, refillAmmo = true): WeaponInstance {
    const spec = this.registry.get(id);
    const inst = new WeaponInstance(spec, refillAmmo);
    this.weapons.set(id, inst);
    if (spec.slot === 'primary') this.inventory.primary = id;
    else if (spec.slot === 'secondary') this.inventory.secondary = id;
    // Grenades accumulate instead of replacing.
    if (spec.slot === 'grenade' && !this.inventory.primary && !this.inventory.secondary) {
      // no-op: grenades live only in the weapons map
    }
    return inst;
  }

  addGrenade(id: string): void {
    const existing = this.weapons.get(id);
    if (existing) {
      existing.mag += 1;
    } else {
      const inst = new WeaponInstance(this.registry.get(id), false);
      inst.mag = 1;
      this.weapons.set(id, inst);
    }
  }

  removeWeapon(id: string): void {
    this.weapons.delete(id);
    if (this.inventory.primary === id) this.inventory.primary = null;
    if (this.inventory.secondary === id) this.inventory.secondary = null;
  }

  switchToSlot(slot: WeaponSlotId, now: number): void {
    if (slot === 'grenade' && !this.inventoryGrenadeId()) return;
    if (slot === 'objective' && !this.inventory.hasBomb) return;
    if (slot === 'primary' && !this.inventory.primary) return;
    if (slot === 'secondary' && !this.inventory.secondary) return;
    const prev = this.activeWeapon();
    prev?.cancelReload();
    this.activeSlot = slot;
    this.zoomIndex = 0;
    const next = this.activeWeapon();
    if (next && next !== prev) {
      next.draw(now);
    }
  }

  spawn(pos: Vec3, yaw: number, startPistol: string): void {
    this.motor.teleport(vec3(pos.x, pos.y, pos.z));
    this.motor.vel = vec3();
    this.motor.crouching = false;
    this.yaw = yaw;
    this.pitch = 0;
    this.health = 100;
    this.armor = 0;
    this.helmet = false;
    this.alive = true;
    this.zoomIndex = 0;
    this.throwCharge = 0;
    this.lastAttackerId = null;
    // Reset inventory: start pistol + knife.
    this.weapons.clear();
    this.inventory = { primary: null, secondary: null, hasBomb: false, defuseKit: false };
    const pistol = new WeaponInstance(this.registry.get(startPistol), true);
    this.weapons.set(startPistol, pistol);
    this.inventory.secondary = startPistol;
    const knife = new WeaponInstance(this.registry.get('knife'), true);
    this.weapons.set('knife', knife);
    this.activeSlot = 'secondary';
    pistol.draw(0);
  }

  /** Apply damage, return actual hp damage. Armor is consumed here. */
  receiveDamage(
    spec: WeaponSpec,
    region: HitRegion,
    distance: number,
    attackerId: number | null,
    now: number,
  ): number {
    if (!this.alive) return 0;
    const armorState: ArmorState = { armor: this.armor, helmet: this.helmet };
    const before = armorState.armor;
    const hpBefore = this.health;
    // Reuse Damage.computeDamage logic inline to capture armor delta.
    let dmg =
      spec.damage * (spec.hitRegionMultipliers[region] ?? 1) * this.distanceFalloff(spec, distance);
    const hasArmor = armorState.armor > 0;
    if (hasArmor) {
      const pen = Math.max(0, Math.min(2, spec.armorPenetration));
      if (region === 'head' && armorState.helmet) {
        armorState.armor = Math.max(0, armorState.armor - dmg * 0.5 * pen);
        dmg *= 0.6;
      } else {
        const absorb = dmg * 0.5 * pen;
        const applied = Math.min(armorState.armor, absorb);
        armorState.armor -= applied;
        dmg -= applied;
      }
    }
    this.armor = armorState.armor;
    const hpDamage = Math.max(1, Math.round(dmg));
    this.health = Math.max(0, this.health - hpDamage);
    this.lastAttackerId = attackerId;
    this.lastDamageAt = now;
    void before;
    void hpBefore;
    return hpDamage;
  }

  private distanceFalloff(spec: WeaponSpec, distance: number): number {
    if (spec.rangeModifier >= 1) return 1;
    return Math.pow(spec.rangeModifier, distance);
  }

  kill(attackerId: number | null): void {
    if (!this.alive) return;
    this.alive = false;
    this.deaths++;
    this.throwCharge = 0;
    this.onDeath?.(this);
  }

  update(dt: number, cmd: PlayerCommand, ctx: UpdateContext): void {
    if (!this.alive) return;

    // Movement.
    const moveInput: MoveInput = {
      forward: ctx.canMove ? cmd.forward : 0,
      right: ctx.canMove ? cmd.right : 0,
      run: cmd.run,
      crouch: cmd.crouch,
      jump: ctx.canMove ? cmd.jump : false,
    };
    this.motor.update(dt, moveInput, this.yaw, ctx.world);

    // Footsteps.
    const hSpeed = Math.hypot(this.motor.vel.x, this.motor.vel.z);
    if (this.motor.grounded && hSpeed > 0.6) {
      this.footstepAccum += dt;
      const interval = 1.5 / (hSpeed + 1);
      if (this.footstepAccum >= interval) {
        this.footstepAccum = 0;
        const loudness = this.crouching ? 0.5 : this.motor.vel.y === 0 && hSpeed < 2 ? 0.8 : 1.0;
        ctx.eventBus.emit('footstep', {
          playerId: this.id,
          pos: vec3(this.pos.x, this.pos.y + 0.1, this.pos.z),
          loudness,
        });
      }
    }

    const weapon = this.activeWeapon();
    if (weapon) {
      weapon.update(ctx.now, dt);

      // Zoom toggle.
      if (cmd.altFire) {
        const levels = weapon.spec.zoomLevels;
        if (levels.length > 1) {
          this.zoomIndex = (this.zoomIndex + 1) % levels.length;
        }
      }
      if (cmd.fireModeSwitch) weapon.cycleFireMode(ctx.now);

      // Reload.
      if (cmd.reload) weapon.reload(ctx.now);

      // Fire.
      if (ctx.canFire && cmd.fire && !weapon.spec.throwable) {
        const origin = this.eyePos();
        const fwd = this.viewForward();
        const ctx2 = {
          now: ctx.now,
          rng: ctx.rng,
          world: ctx.world,
          origin,
          forward: fwd,
          right: this.viewRight(),
          up: vec3(0, 1, 0),
          isCrouching: this.crouching,
          isAirborne: !this.motor.grounded,
          moveSpeed: hSpeed,
          maxSpeed: weapon.spec.maxMoveSpeed,
          zoomed: this.zoomIndex > 0,
          zoomLevel: this.zoomIndex,
          velYUp: this.motor.vel.y > 1,
          resolveShot: (dir: Vec3) => ctx.resolveShot(this, weapon.spec, origin, dir),
          onFired: (spec: WeaponSpec) => {
            ctx.eventBus.emit('weapon_fired', {
              shooterId: this.id,
              weaponId: spec.id,
              pos: vec3(origin.x, origin.y, origin.z),
              loudness: spec.loudness,
            });
          },
        };
        weapon.tryFire(ctx2, cmd.fire);
      }

      // Grenade throw with charge.
      if (weapon.spec.throwable) {
        if (cmd.throwGrenade) {
          this.throwCharge = Math.min(1, this.throwCharge + dt / 1.2);
        } else if (this.throwCharge > 0) {
          const power = cmd.grenadePower ?? this.throwCharge;
          const dir = yawPitchForward(
            this.yaw,
            this.pitch - 0.12,
          );
          ctx.throwGrenade(this, weapon.spec, power, dir);
          weapon.mag -= 1;
          this.throwCharge = 0;
          if (weapon.mag <= 0) {
            this.switchToSlot(this.inventory.secondary ? 'secondary' : 'knife', ctx.now);
          }
        }
      } else {
        this.throwCharge = 0;
      }
    }

    // Slot switch.
    if (cmd.switchSlot) this.switchToSlot(cmd.switchSlot, ctx.now);

    // Use.
    if (cmd.usePressed) ctx.onUse(this);
  }

  /** Distance from another entity (XZ plane). */
  distTo(other: PlayerEntity): number {
    return distXZ(this.pos, other.pos);
  }

  bodyHeight(): number {
    return bodyHeight(this);
  }

  /** Armor state snapshot for damage math. */
  armorState(): ArmorState {
    return { armor: this.armor, helmet: this.helmet };
  }
}

export function slotOf(spec: WeaponSpec): WeaponSlotId {
  return spec.slot;
}

export { SLOT_ORDER };
