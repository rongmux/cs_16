// Map builder: converts the data-driven map definition (walkable rooms +
// explicit solid boxes) into collision geometry, render boxes, bounds and a
// waypoint grid. Rooms are axis-aligned rects on a 1m grid; walls are generated
// along every walkable/non-walkable boundary, which makes the topology immune
// to hand-placed wall mistakes (see docs/DECISIONS.md).

import { vec3, Vec3 } from '../core/math';
import { CollisionWorld } from './CollisionWorld';
import type { MapBoxDef, MapData } from './MapData';

export interface BuiltMap {
  data: MapData;
  collision: CollisionWorld;
  /** Boxes for the renderer (walls, solids, floor). */
  renderBoxes: MapBoxDef[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Generated waypoint nodes [x, y, z]. */
  waypoints: Vec3[];
}

const CELL = 1;

interface EdgeKey {
  i: number;
  j: number;
  /** 0 = +x face, 1 = +z face */
  axis: 0 | 1;
}

export function buildMap(data: MapData): BuiltMap {
  const solids = data.boxes.map((b) => {
    const half = { x: b.s[0] / 2, y: b.s[1] / 2, z: b.s[2] / 2 };
    return {
      min: vec3(b.c[0] - half.x, b.c[1] - half.y, b.c[2] - half.z),
      max: vec3(b.c[0] + half.x, b.c[1] + half.y, b.c[2] + half.z),
    };
  });

  // Determine walkable cell bounds.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const r of data.rooms) {
    minX = Math.min(minX, r[0]);
    maxX = Math.max(maxX, r[1]);
    minZ = Math.min(minZ, r[2]);
    maxZ = Math.max(maxZ, r[3]);
  }
  if (!isFinite(minX)) throw new Error(`Map ${data.id} has no rooms`);

  const inRoom = (x: number, z: number): boolean =>
    data.rooms.some((r) => x >= r[0] && x < r[1] && z >= r[2] && z < r[3]);

  const inSolid = (x: number, z: number): boolean => {
    const cx = x + 0.5, cz = z + 0.5;
    return solids.some((s) => cx > s.min.x && cx < s.max.x && cz > s.min.z && cz < s.max.z);
  };

  const walkable = (x: number, z: number): boolean =>
    x >= minX && x < maxX && z >= minZ && z < maxZ && inRoom(x, z) && !inSolid(x, z);

  // Collect wall edges: walkable cell adjacent to non-walkable.
  const edges = new Map<string, EdgeKey>();
  const keyOf = (e: EdgeKey) => `${e.axis}:${e.i}:${e.j}`;
  for (let i = minX; i < maxX; i++) {
    for (let j = minZ; j < maxZ; j++) {
      if (!walkable(i, j)) continue;
      if (!walkable(i + 1, j)) {
        const e = { axis: 0 as const, i: i + 1, j };
        edges.set(keyOf(e), e);
      }
      if (!walkable(i - 1, j)) {
        const e = { axis: 0 as const, i, j };
        edges.set(keyOf(e), e);
      }
      if (!walkable(i, j + 1)) {
        const e = { axis: 1 as const, i, j: j + 1 };
        edges.set(keyOf(e), e);
      }
      if (!walkable(i, j - 1)) {
        const e = { axis: 1 as const, i, j };
        edges.set(keyOf(e), e);
      }
    }
  }

  // Merge colinear adjacent edges into wall runs.
  const boxes: MapBoxDef[] = [];
  const wallColor = '#8b8f85';
  const used = new Set<string>();
  for (const e of edges.values()) {
    if (used.has(keyOf(e))) continue;
    used.add(keyOf(e));
    if (e.axis === 0) {
      // Wall along X: fixed x = e.i, varying j.
      let j1 = e.j;
      while (edges.has(keyOf({ axis: 0, i: e.i, j: j1 + 1 }))) {
        j1++;
        used.add(keyOf({ axis: 0, i: e.i, j: j1 }));
      }
      const len = j1 - e.j + 1;
      boxes.push({
        c: [e.i, 1.75, e.j + len / 2],
        s: [0.4, 3.5, len],
        m: 'concrete',
        color: wallColor,
      });
    } else {
      // Wall along Z: fixed z = e.j, varying i.
      let i1 = e.i;
      while (edges.has(keyOf({ axis: 1, i: i1 + 1, j: e.j }))) {
        i1++;
        used.add(keyOf({ axis: 1, i: i1, j: e.j }));
      }
      const len = i1 - e.i + 1;
      boxes.push({
        c: [e.i + len / 2, 1.75, e.j],
        s: [len, 3.5, 0.4],
        m: 'concrete',
        color: wallColor,
      });
    }
  }

  // Floor slab under the whole walkable bounds (plus 1m margin).
  const floorW = maxX - minX + 2;
  const floorD = maxZ - minZ + 2;
  boxes.push({
    c: [(minX + maxX) / 2, -0.25, (minZ + maxZ) / 2],
    s: [floorW, 0.5, floorD],
    m: 'ground',
    color: '#6f7566',
  });

  // Explicit solids (crates, pillars).
  for (const s of data.boxes) boxes.push(s);

  // Collision world.
  const collision = new CollisionWorld();
  for (const b of boxes) {
    collision.addBox(vec3(b.c[0], b.c[1], b.c[2]), vec3(b.s[0], b.s[1], b.s[2]), b.m);
  }

  // Waypoint generation on a 2m grid over walkable cells.
  const waypoints: Vec3[] = [];
  const seen = new Set<string>();
  const addNode = (x: number, y: number, z: number) => {
    const k = `${Math.round(x * 2)}:${Math.round(z * 2)}`;
    if (seen.has(k)) return;
    seen.add(k);
    waypoints.push(vec3(x, y, z));
  };
  for (let i = minX; i < maxX; i++) {
    for (let j = minZ; j < maxZ; j++) {
      if (!walkable(i, j)) continue;
      if ((i - minX) % 2 !== 0 || (j - minZ) % 2 !== 0) continue;
      addNode(i + 0.5, 0, j + 0.5);
    }
  }

  // Ensure nodes near spawns and objective zones exist.
  const spawnPoints = [...data.spawns.attackers, ...data.spawns.defenders];
  for (const s of spawnPoints) {
    const near = nearestWalkableCell(s.pos[0], s.pos[2]);
    if (near) addNode(near.x, 0, near.z);
  }
  for (const site of data.bombSites) {
    const near = nearestWalkableCell(site.center[0], site.center[1]);
    if (near) addNode(near.x, 0, near.z);
  }
  for (const z of data.buyZones) {
    const near = nearestWalkableCell(z.center[0], z.center[1]);
    if (near) addNode(near.x, 0, near.z);
  }
  for (const w of data.waypoints) {
    addNode(w[0], w[1], w[2]);
  }

  function nearestWalkableCell(x: number, z: number): { x: number; z: number } | null {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    // Spiral search within 6 cells.
    for (let r = 0; r <= 6; r++) {
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const ci = cx + di;
          const cj = cz + dj;
          if (ci >= minX && ci < maxX && cj >= minZ && cj < maxZ && walkable(ci, cj)) {
            return { x: ci + 0.5, z: cj + 0.5 };
          }
        }
      }
    }
    return null;
  }

  return {
    data,
    collision,
    renderBoxes: boxes,
    bounds: { minX, maxX, minZ, maxZ },
    waypoints,
  };
}
