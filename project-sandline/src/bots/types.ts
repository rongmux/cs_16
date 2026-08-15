// Bot-facing read API of the match (avoids circular imports between the bot
// layer and the match simulator). Bots may only act on information exposed
// here or gathered through their own perception (design doc 19.2).

import type { EventBus, TeamId } from '../core/EventBus';
import type { RNG } from '../core/RNG';
import type { CollisionWorld } from '../world/CollisionWorld';
import type { MapData } from '../world/MapData';
import type { WaypointGraph } from '../nav/WaypointGraph';
import type { PlayerEntity } from '../player/PlayerEntity';
import type { WeaponRegistry } from '../weapons/WeaponRegistry';
import type { BombObjective } from '../objectives/BombObjective';
import type { RoundSnapshot } from '../rules/RoundManager';

export interface GameWorldApi {
  players(): PlayerEntity[];
  playerById(id: number): PlayerEntity | undefined;
  enemiesOf(team: TeamId): PlayerEntity[];
  collision: CollisionWorld;
  navGraph: WaypointGraph;
  bomb: BombObjective;
  mapData: MapData;
  eventBus: EventBus;
  rng: RNG;
  registry: WeaponRegistry;
  nowMs(): number;
  time(): number;
  roundSnapshot(): RoundSnapshot;
  frozen(): boolean;
  buyingAllowed(): boolean;
  mode(): 'bomb' | 'training';
  /** Buy via the match's buy system (bots). */
  tryBuy(playerId: number, item: string): boolean;
  /** Register a bot entity in the match (BotManager). */
  addPlayer(entity: PlayerEntity): void;
  /** Nearest waypoint index to a position. */
  nearestNode(p: { x: number; y: number; z: number }): number;
  /** Waypoint nodes near a bomb site (cover/hold positions). */
  siteNodes(siteId: string): { x: number; y: number; z: number }[];
  /** Waypoints inside any buy zone (for round-start purchases). */
  buyZoneNodes(): { x: number; y: number; z: number }[];
  randomSiteId(): string;
  enemySites(): { id: string; center: [number, number]; radius: number }[];
}
