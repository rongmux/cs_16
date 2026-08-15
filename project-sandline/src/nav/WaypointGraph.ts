// Waypoint navigation graph: nodes are placed by MapBuilder, edges are added
// between node pairs with clear line of sight (probe at chest height).
// A* + line-of-sight path smoothing. MVP navigation choice (design doc allows
// an upgrade path to recast-navigation-js later; see docs/DECISIONS.md).

import { Vec3, vec3, distSq, sub } from '../core/math';
import type { CollisionWorld } from '../world/CollisionWorld';

export interface PathResult {
  path: Vec3[];
  found: boolean;
  /** Node expansion count (debug / perf). */
  explored: number;
}

export class WaypointGraph {
  nodes: Vec3[] = [];
  private adjacency: number[][] = [];

  /** Build edges between nodes within maxEdgeLen with clear LOS. */
  build(nodes: Vec3[], world: CollisionWorld, maxEdgeLen = 8, probeY = 0.9): void {
    this.nodes = nodes.map((n) => vec3(n.x, n.y, n.z));
    this.adjacency = this.nodes.map(() => []);
    const n = this.nodes.length;
    for (let i = 0; i < n; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.nodes[j];
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > maxEdgeLen * maxEdgeLen) continue;
        const pa = vec3(a.x, probeY, a.z);
        const pb = vec3(b.x, probeY, b.z);
        if (world.segmentClear(pa, pb)) {
          this.adjacency[i].push(j);
          this.adjacency[j].push(i);
        }
      }
    }
  }

  nearestNode(p: Vec3): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const d = distSq(this.nodes[i], p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  findPath(from: Vec3, to: Vec3): PathResult {
    const start = this.nearestNode(from);
    const goal = this.nearestNode(to);
    if (start < 0 || goal < 0) return { path: [], found: false, explored: 0 };
    if (start === goal) return { path: [vec3(to.x, 0, to.z)], found: true, explored: 0 };

    const n = this.nodes.length;
    const open: number[] = [start];
    const gScore = new Map<number, number>([[start, 0]]);
    const cameFrom = new Map<number, number>();
    const closed = new Set<number>();
    let explored = 0;
    const h = (i: number) => {
      const a = this.nodes[i];
      const dx = a.x - to.x;
      const dz = a.z - to.z;
      return Math.sqrt(dx * dx + dz * dz);
    };

    while (open.length > 0) {
      // Pop node with lowest f score.
      let bestIdx = 0;
      let bestF = Infinity;
      for (let k = 0; k < open.length; k++) {
        const f = (gScore.get(open[k]) ?? Infinity) + h(open[k]);
        if (f < bestF) {
          bestF = f;
          bestIdx = k;
        }
      }
      const cur = open.splice(bestIdx, 1)[0];
      if (cur === goal) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      explored++;
      if (explored > 4000) break; // safety cap

      for (const next of this.adjacency[cur]) {
        if (closed.has(next)) continue;
        const d = Math.sqrt(distSq(this.nodes[cur], this.nodes[next]));
        const g = (gScore.get(cur) ?? Infinity) + d;
        if (g < (gScore.get(next) ?? Infinity)) {
          gScore.set(next, g);
          cameFrom.set(next, cur);
          if (!open.includes(next)) open.push(next);
        }
      }
    }

    if (!cameFrom.has(goal) && start !== goal) {
      // No path found: report partial path to the closest reached node.
      return { path: [], found: false, explored };
    }

    const path: Vec3[] = [];
    let cur: number | undefined = goal;
    while (cur !== undefined) {
      path.push(vec3(this.nodes[cur].x, 0, this.nodes[cur].z));
      cur = cameFrom.get(cur);
    }
    path.reverse();
    path[path.length - 1] = vec3(to.x, 0, to.z);
    return { path, found: true, explored };
  }

  /** Drop intermediate waypoints that have clear LOS to the previous kept point. */
  smoothPath(path: Vec3[], world: CollisionWorld, probeY = 0.9): Vec3[] {
    if (path.length <= 2) return path;
    const out: Vec3[] = [path[0]];
    let anchor = 0;
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[anchor];
      const c = path[i + 1];
      if (!world.segmentClear(vec3(a.x, probeY, a.z), vec3(c.x, probeY, c.z))) {
        out.push(path[i]);
        anchor = i;
      }
    }
    out.push(path[path.length - 1]);
    return out;
  }

  /** Cheap connectivity check used by map validation. */
  nodesReachableFrom(start: Vec3): Set<number> {
    const startIdx = this.nearestNode(start);
    if (startIdx < 0) return new Set();
    const seen = new Set<number>([startIdx]);
    const stack = [startIdx];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const next of this.adjacency[cur]) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return seen;
  }

  closestNodeIndex(p: Vec3): number {
    return this.nearestNode(p);
  }

  nodePosition(i: number): Vec3 {
    return this.nodes[i];
  }
}

export function xzDistance(a: Vec3, b: Vec3): number {
  const d = sub(a, b);
  return Math.sqrt(d.x * d.x + d.z * d.z);
}
