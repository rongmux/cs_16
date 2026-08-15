// Throwable grenade projectile: gravity + box bounce against the static
// world, then a fuse-triggered explosion (frag only in MVP; flash/smoke are
// second-stage per design doc 14).

import { Vec3, vec3 } from '../core/math';
import type { TeamId } from '../core/EventBus';
import type { CollisionWorld } from '../world/CollisionWorld';
import { movement } from '../world/DataFiles';

export class GrenadeSim {
  pos: Vec3;
  vel: Vec3;
  fuse: number;
  radius: number;
  damage: number;
  ownerId: number;
  ownerTeam: TeamId;
  exploded = false;
  private bounces = 0;

  constructor(
    pos: Vec3,
    vel: Vec3,
    fuseSec: number,
    radius: number,
    damage: number,
    ownerId: number,
    ownerTeam: TeamId,
  ) {
    this.pos = vec3(pos.x, pos.y, pos.z);
    this.vel = vec3(vel.x, vel.y, vel.z);
    this.fuse = fuseSec;
    this.radius = radius;
    this.damage = damage;
    this.ownerId = ownerId;
    this.ownerTeam = ownerTeam;
  }

  /** Returns true when the grenade detonated this tick. */
  update(dt: number, world: CollisionWorld): boolean {
    if (this.exploded) return true;
    this.vel.y -= movement.gravity * dt;
    const half = vec3(0.07, 0.07, 0.07);
    const result = world.moveAABB(this.pos, half, vec3(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt), 0.02);
    this.pos = result.pos;
    if (result.blockedX) {
      this.vel.x = -this.vel.x * 0.45;
      this.bounces++;
    }
    if (result.blockedZ) {
      this.vel.z = -this.vel.z * 0.45;
      this.bounces++;
    }
    if (result.grounded) {
      this.vel.y = -this.vel.y * 0.45;
      this.vel.x *= 0.72;
      this.vel.z *= 0.72;
      if (Math.abs(this.vel.y) < 0.4) this.vel.y = 0;
      this.bounces++;
    }
    if (this.bounces > 6) {
      // Settle: kill excess velocity to avoid infinite bouncing.
      this.vel.x *= 0.5;
      this.vel.z *= 0.5;
    }
    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.exploded = true;
      return true;
    }
    return false;
  }
}
