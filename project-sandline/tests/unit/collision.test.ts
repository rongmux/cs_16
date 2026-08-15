import { describe, it, expect } from 'vitest';
import { CollisionWorld } from '../../src/world/CollisionWorld';
import { vec3 } from '../../src/core/math';

function testWorld(): CollisionWorld {
  const w = new CollisionWorld();
  // Floor slab 20x20 at y=0.
  w.addBox(vec3(0, -0.25, 0), vec3(20, 0.5, 20), 'ground');
  // Wall at x=4, z in [-5, 5], height 3.
  w.addBox(vec3(4, 1.5, 0), vec3(0.5, 3, 10), 'concrete');
  return w;
}

describe('CollisionWorld', () => {
  it('raycast hits a wall', () => {
    const w = testWorld();
    const hit = w.raycast(vec3(0, 1, 0), vec3(1, 0, 0), 100);
    expect(hit.hit).toBe(true);
    expect(hit.distance).toBeCloseTo(3.75, 1);
    expect(hit.normal.x).toBeCloseTo(-1);
  });

  it('raycast misses into open space', () => {
    const w = testWorld();
    const hit = w.raycast(vec3(0, 1, 0), vec3(0, 0, 1), 100);
    expect(hit.hit).toBe(false);
  });

  it('raycast respects max distance', () => {
    const w = testWorld();
    const hit = w.raycast(vec3(0, 1, 0), vec3(1, 0, 0), 1);
    expect(hit.hit).toBe(false);
  });

  it('moveAABB slides along a wall', () => {
    const w = testWorld();
    const half = vec3(0.3, 0.85, 0.3);
    const start = vec3(0, 0, 0);
    // Move diagonally into the wall.
    const result = w.moveAABB(start, half, vec3(5, 0, 1), 0.01);
    expect(result.blockedX).toBe(true);
    expect(result.pos.x).toBeLessThanOrEqual(4 - 0.3 - 0.01 + 1e-6);
    // Z movement is preserved.
    expect(result.pos.z).toBeCloseTo(1);
  });

  it('reports grounded on the floor', () => {
    const w = testWorld();
    const half = vec3(0.3, 0.85, 0.3);
    const result = w.moveAABB(vec3(0, 0.001, 0), half, vec3(0, 0, 0), 0.01);
    expect(result.grounded).toBe(true);
  });

  it('falls until it lands', () => {
    const w = testWorld();
    const half = vec3(0.3, 0.85, 0.3);
    const result = w.moveAABB(vec3(0, 2, 0), half, vec3(0, -10, 0), 0.01);
    expect(result.grounded).toBe(true);
    expect(result.pos.y).toBeCloseTo(0, 3);
  });
});
