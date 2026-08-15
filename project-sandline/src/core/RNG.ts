// Deterministic seeded RNG (mulberry32) with a string hash helper.
// All gameplay randomness (spread, bot decisions, spawn picks) flows through
// an instance of this class so runs can be reproduced with a fixed seed.

export class RNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /** Next float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** Random direction on the horizontal plane. */
  dir2(): { x: number; z: number } {
    const a = this.next() * Math.PI * 2;
    return { x: Math.cos(a), z: Math.sin(a) };
  }

  /** Uniformly distributed direction inside a cone of `maxAngleDeg` degrees around forward. */
  coneDir(forward: { x: number; y: number; z: number }, maxAngleDeg: number): { x: number; y: number; z: number } {
    const cosMax = Math.cos((maxAngleDeg * Math.PI) / 180);
    // Uniform on a spherical cap: cos(theta) in [cosMax, 1].
    const z = cosMax + this.next() * (1 - cosMax);
    const phi = this.next() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    // Local frame: build an orthonormal basis around forward.
    const f = forward;
    const fLen = Math.hypot(f.x, f.y, f.z) || 1;
    const fx = f.x / fLen;
    const fy = f.y / fLen;
    const fz = f.z / fLen;
    // Pick an arbitrary perpendicular vector.
    const ref = Math.abs(fx) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    let ux = ref.y * fz - ref.z * fy;
    let uy = ref.z * fx - ref.x * fz;
    let uz = ref.x * fy - ref.y * fx;
    const uLen = Math.hypot(ux, uy, uz) || 1;
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;
    // v = f x u
    const vx = fy * uz - fz * uy;
    const vy = fz * ux - fx * uz;
    const vz = fx * uy - fy * ux;
    return {
      x: fx * z + ux * r * Math.cos(phi) + vx * r * Math.sin(phi),
      y: fy * z + uy * r * Math.cos(phi) + vy * r * Math.sin(phi),
      z: fz * z + uz * r * Math.cos(phi) + vz * r * Math.sin(phi),
    };
  }

  /** Hash a string into a 32-bit seed (xmur3). */
  static fromString(str: string): number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
}
