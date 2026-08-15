import { describe, it, expect } from 'vitest';
import { RNG } from '../../src/core/RNG';

describe('RNG', () => {
  it('is deterministic for a fixed seed', () => {
    const a = new RNG(12345);
    const b = new RNG(12345);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces values in [0,1)', () => {
    const rng = new RNG(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range and int respect bounds', () => {
    const rng = new RNG(42);
    for (let i = 0; i < 500; i++) {
      const r = rng.range(2, 5);
      expect(r).toBeGreaterThanOrEqual(2);
      expect(r).toBeLessThan(5);
      const n = rng.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('coneDir stays within the requested cone', () => {
    const rng = new RNG(99);
    const forward = { x: 0, y: 0, z: -1 };
    for (let i = 0; i < 1000; i++) {
      const d = rng.coneDir(forward, 10);
      const dot = d.x * forward.x + d.y * forward.y + d.z * forward.z;
      expect(dot).toBeGreaterThan(Math.cos((10 * Math.PI) / 180) - 1e-9);
    }
  });

  it('fromString hashes consistently', () => {
    expect(RNG.fromString('abc')).toBe(RNG.fromString('abc'));
    expect(RNG.fromString('abc')).not.toBe(RNG.fromString('abd'));
  });
});
