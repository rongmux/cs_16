// Static box collision world with raycasts and AABB sweeps.
// All map geometry is axis-aligned boxes, which keeps this module small,
// deterministic and testable headless (see docs/DECISIONS.md).

import { Vec3, vec3 } from '../core/math';

export interface ColliderBox {
  min: Vec3;
  max: Vec3;
  /** Material id from data/game/materials.json (empty = solid default). */
  material: string;
}

export interface RayHit {
  hit: boolean;
  point: Vec3;
  normal: Vec3;
  distance: number;
  boxIndex: number;
  material: string;
}

const NO_HIT: RayHit = {
  hit: false,
  point: vec3(),
  normal: vec3(0, 1, 0),
  distance: Infinity,
  boxIndex: -1,
  material: '',
};

export interface MoveResult {
  pos: Vec3;
  /** True when the mover is standing on a surface. */
  grounded: boolean;
  /** True when the horizontal move hit a wall (used for step logic). */
  blockedX: boolean;
  blockedZ: boolean;
  /** Floor normal when grounded (0,1,0) for flat floors. */
  groundNormal: Vec3;
  hitWallNormal: Vec3;
}

export class CollisionWorld {
  boxes: ColliderBox[] = [];

  addBox(center: Vec3, size: Vec3, material = 'concrete'): number {
    const half = { x: size.x / 2, y: size.y / 2, z: size.z / 2 };
    this.boxes.push({
      min: vec3(center.x - half.x, center.y - half.y, center.z - half.z),
      max: vec3(center.x + half.x, center.y + half.y, center.z + half.z),
      material,
    });
    return this.boxes.length - 1;
  }

  clear(): void {
    this.boxes = [];
  }

  pointInSolid(p: Vec3, skin = 0): boolean {
    for (const b of this.boxes) {
      if (
        p.x > b.min.x + skin && p.x < b.max.x - skin &&
        p.y > b.min.y + skin && p.y < b.max.y - skin &&
        p.z > b.min.z + skin && p.z < b.max.z - skin
      ) {
        return true;
      }
    }
    return false;
  }

  /** Slab-method raycast. Returns nearest hit within maxDist. */
  raycast(origin: Vec3, dir: Vec3, maxDist = Infinity): RayHit {
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-12) return { ...NO_HIT };
    const invLen = 1 / len;
    let best: RayHit = { ...NO_HIT, distance: maxDist };
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      let tmin = -Infinity;
      let tmax = Infinity;
      let axis = 0;
      // X slab
      if (Math.abs(dir.x) < 1e-12) {
        if (origin.x < b.min.x || origin.x > b.max.x) continue;
      } else {
        const t1 = ((b.min.x - origin.x) / dir.x) * invLen;
        const t2 = ((b.max.x - origin.x) / dir.x) * invLen;
        const ta = Math.min(t1, t2);
        const tb = Math.max(t1, t2);
        if (ta > tmin) { tmin = ta; axis = 0; }
        tmax = Math.min(tmax, tb);
      }
      if (tmin > tmax) continue;
      // Y slab
      if (Math.abs(dir.y) < 1e-12) {
        if (origin.y < b.min.y || origin.y > b.max.y) continue;
      } else {
        const t1 = ((b.min.y - origin.y) / dir.y) * invLen;
        const t2 = ((b.max.y - origin.y) / dir.y) * invLen;
        const ta = Math.min(t1, t2);
        const tb = Math.max(t1, t2);
        if (ta > tmin) { tmin = ta; axis = 1; }
        tmax = Math.min(tmax, tb);
      }
      if (tmin > tmax) continue;
      // Z slab
      if (Math.abs(dir.z) < 1e-12) {
        if (origin.z < b.min.z || origin.z > b.max.z) continue;
      } else {
        const t1 = ((b.min.z - origin.z) / dir.z) * invLen;
        const t2 = ((b.max.z - origin.z) / dir.z) * invLen;
        const ta = Math.min(t1, t2);
        const tb = Math.max(t1, t2);
        if (ta > tmin) { tmin = ta; axis = 2; }
        tmax = Math.min(tmax, tb);
      }
      if (tmin > tmax) continue;
      if (tmin < 0 || tmin > maxDist) continue;
      if (tmin < best.distance) {
        const normal = vec3();
        if (axis === 0) normal.x = dir.x < 0 ? 1 : -1;
        else if (axis === 1) normal.y = dir.y < 0 ? 1 : -1;
        else normal.z = dir.z < 0 ? 1 : -1;
        best = {
          hit: true,
          point: vec3(origin.x + dir.x * invLen * tmin, origin.y + dir.y * invLen * tmin, origin.z + dir.z * invLen * tmin),
          normal,
          distance: tmin,
          boxIndex: i,
          material: b.material,
        };
      }
    }
    if (!best.hit) best.distance = maxDist;
    return best;
  }

  /** Is the segment from a to b free of solid geometry? */
  segmentClear(a: Vec3, b: Vec3): boolean {
    const d = vec3(b.x - a.x, b.y - a.y, b.z - a.z);
    const dist = Math.hypot(d.x, d.y, d.z);
    if (dist < 1e-9) return !this.pointInSolid(a);
    const hit = this.raycast(a, vec3(d.x / dist, d.y / dist, d.z / dist), dist);
    return !hit.hit;
  }

  /**
   * Move an AABB from `pos` (center of the box bottom is placed at pos.y) by
   * `delta`, resolving collisions axis by axis. pos is the mover's foot
   * position; halfExtents describes the box around it.
   */
  moveAABB(pos: Vec3, halfExtents: Vec3, delta: Vec3, skin = 0.01): MoveResult {
    const result: MoveResult = {
      pos: vec3(pos.x, pos.y, pos.z),
      grounded: false,
      blockedX: false,
      blockedZ: false,
      groundNormal: vec3(0, 1, 0),
      hitWallNormal: vec3(0, 0, 0),
    };

    // X axis
    result.pos.x += delta.x;
    if (delta.x !== 0 && this.overlaps(result.pos, halfExtents, skin)) {
      for (const b of this.boxes) {
        if (!this.overlapsBox(result.pos, halfExtents, b, skin)) continue;
        if (delta.x > 0) result.pos.x = b.min.x - halfExtents.x - skin;
        else result.pos.x = b.max.x + halfExtents.x + skin;
        result.blockedX = true;
        result.hitWallNormal.x = delta.x > 0 ? -1 : 1;
      }
      if (this.overlaps(result.pos, halfExtents, skin)) result.pos.x = pos.x;
    }

    // Z axis
    result.pos.z += delta.z;
    if (delta.z !== 0 && this.overlaps(result.pos, halfExtents, skin)) {
      for (const b of this.boxes) {
        if (!this.overlapsBox(result.pos, halfExtents, b, skin)) continue;
        if (delta.z > 0) result.pos.z = b.min.z - halfExtents.z - skin;
        else result.pos.z = b.max.z + halfExtents.z + skin;
        result.blockedZ = true;
        result.hitWallNormal.z = delta.z > 0 ? -1 : 1;
      }
      if (this.overlaps(result.pos, halfExtents, skin)) result.pos.z = pos.z;
    }

    // Y axis
    result.pos.y += delta.y;
    if (delta.y !== 0 && this.overlaps(result.pos, halfExtents, skin)) {
      let resolved = false;
      for (const b of this.boxes) {
        if (!this.overlapsBox(result.pos, halfExtents, b, skin)) continue;
        if (delta.y > 0) {
          result.pos.y = b.min.y - halfExtents.y - skin;
        } else {
          result.pos.y = b.max.y + halfExtents.y + skin;
          result.grounded = true;
        }
        resolved = true;
      }
      if (!resolved && this.overlaps(result.pos, halfExtents, skin)) result.pos.y = pos.y;
    }

    // Ground probe: ray straight down from the box bottom.
    const probeOrigin = vec3(result.pos.x, result.pos.y + halfExtents.y + 0.02, result.pos.z);
    const down = this.raycast(probeOrigin, vec3(0, -1, 0), halfExtents.y * 2 + 0.06);
    if (down.hit) {
      result.grounded = true;
      result.groundNormal = down.normal;
    }
    return result;
  }

  private overlaps(pos: Vec3, half: Vec3, skin: number): boolean {
    for (const b of this.boxes) {
      if (this.overlapsBox(pos, half, b, skin)) return true;
    }
    return false;
  }

  private overlapsBox(pos: Vec3, half: Vec3, b: ColliderBox, skin: number): boolean {
    return (
      pos.x + half.x > b.min.x + skin && pos.x - half.x < b.max.x - skin &&
      pos.y + half.y > b.min.y + skin && pos.y - half.y < b.max.y - skin &&
      pos.z + half.z > b.min.z + skin && pos.z - half.z < b.max.z - skin
    );
  }

  /** Highest floor Y under (x,z) starting from y=fromY, or null if none. */
  floorYBelow(x: number, z: number, fromY = 100): number | null {
    const hit = this.raycast(vec3(x, fromY, z), vec3(0, -1, 0), fromY + 20);
    return hit.hit ? hit.point.y : null;
  }
}
