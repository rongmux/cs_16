// Map metadata / data format.
// Game rules never live in Blender object names or magic strings: the map JSON
// is the single source of truth for geometry, spawns, buy zones, bomb sites,
// waypoints and dummies (design doc 24).

export type GameMode = 'bomb' | 'training';

export interface MapBoxDef {
  /** center */
  c: [number, number, number];
  /** size */
  s: [number, number, number];
  /** material id from data/game/materials.json */
  m: string;
  /** hex color for the graybox renderer */
  color: string;
}

export interface SpawnDef {
  pos: [number, number, number];
  yaw: number;
}

export interface ZoneDef {
  center: [number, number];
  radius: number;
}

export interface BombSiteDef {
  id: string;
  label: string;
  center: [number, number];
  radius: number;
}

export interface MapData {
  id: string;
  name: string;
  mode: GameMode;
  /** Walkable rectangles [minX, maxX, minZ, maxZ] on the 1m grid. */
  rooms: [number, number, number, number][];
  /** Explicit solid boxes placed inside walkable rooms. */
  boxes: MapBoxDef[];
  spawns: { attackers: SpawnDef[]; defenders: SpawnDef[] };
  buyZones: ZoneDef[];
  bombSites: BombSiteDef[];
  rescueZones: ZoneDef[];
  /** Waypoint graph nodes for bot navigation, [x, y, z]. */
  waypoints: [number, number, number][];
  /** Static training dummies, [x, y, z, yaw]. */
  dummies: [number, number, number, number][];
  /** Radar backdrop size in world units [width, depth], origin at map center. */
  radarBounds: [number, number];
}

export function emptyMapData(id: string, name: string, mode: GameMode): MapData {
  return {
    id,
    name,
    mode,
    rooms: [],
    boxes: [],
    spawns: { attackers: [], defenders: [] },
    buyZones: [],
    bombSites: [],
    rescueZones: [],
    waypoints: [],
    dummies: [],
    radarBounds: [64, 64],
  };
}
