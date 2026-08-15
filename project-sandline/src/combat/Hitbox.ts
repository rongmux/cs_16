// Hitbox region determination: given a hit point on a player's bounding box,
// classify the region (head/chest/stomach/arm/leg) from the vertical fraction
// and horizontal offset. Pure function - unit tested.

import { Vec3 } from '../core/math';
import type { HitRegion } from '../core/EventBus';

export interface HitboxSource {
  /** Foot position. */
  pos: Vec3;
  crouching: boolean;
  standingHeight: number;
  crouchingHeight: number;
  radius: number;
}

export function bodyHeight(src: HitboxSource): number {
  return src.crouching ? src.crouchingHeight : src.standingHeight;
}

/** AABB of the entity's body. */
export function bodyBounds(src: HitboxSource): { min: Vec3; max: Vec3 } {
  const h = bodyHeight(src);
  const r = src.radius;
  return {
    min: { x: src.pos.x - r, y: src.pos.y, z: src.pos.z - r },
    max: { x: src.pos.x + r, y: src.pos.y + h, z: src.pos.z + r },
  };
}

/** Ray vs AABB (slab test). Returns t or null. */
export function rayAABB(
  origin: Vec3,
  dir: Vec3,
  min: Vec3,
  max: Vec3,
  maxDist = 1000,
): number | null {
  let tmin = 0;
  let tmax = maxDist;
  const inv = (d: number) => (Math.abs(d) < 1e-12 ? 0 : 1 / d);
  {
    const ix = inv(dir.x);
    if (ix === 0) {
      if (origin.x < min.x || origin.x > max.x) return null;
    } else {
      let t1 = (min.x - origin.x) * ix;
      let t2 = (max.x - origin.x) * ix;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  {
    const iy = inv(dir.y);
    if (iy === 0) {
      if (origin.y < min.y || origin.y > max.y) return null;
    } else {
      let t1 = (min.y - origin.y) * iy;
      let t2 = (max.y - origin.y) * iy;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  {
    const iz = inv(dir.z);
    if (iz === 0) {
      if (origin.z < min.z || origin.z > max.z) return null;
    } else {
      let t1 = (min.z - origin.z) * iz;
      let t2 = (max.z - origin.z) * iz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

/**
 * Classify the hit region for a point on the entity's body.
 * Vertical fractions (fractions of body height):
 *   head >= 0.86, chest >= 0.64, stomach >= 0.42, else legs;
 * far horizontal offsets from the spine count as arms.
 */
export function hitRegionAt(src: HitboxSource, point: Vec3): HitRegion {
  const h = bodyHeight(src);
  const localY = point.y - src.pos.y;
  const relY = localY / Math.max(0.001, h);
  const dx = Math.abs(point.x - src.pos.x);
  const dz = Math.abs(point.z - src.pos.z);
  const horiz = Math.max(dx, dz);
  const r = src.radius;

  if (relY >= 0.86) return 'head';
  if (horiz > r * 0.45 && relY >= 0.42) return 'arm';
  if (relY >= 0.64) return 'chest';
  if (relY >= 0.42) return 'stomach';
  return 'leg';
}
