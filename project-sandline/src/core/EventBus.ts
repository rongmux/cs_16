// Minimal synchronous typed event bus.
// Per design doc 6.4: used only for discrete game events (round start/end,
// deaths, bomb events, sounds, announcements) - never for per-frame data.

import type { Vec3 } from './math';

export type TeamId = 'attackers' | 'defenders' | 'spectator';

export type HitRegion = 'head' | 'chest' | 'stomach' | 'arm' | 'leg';

export type WeaponSlotId = 'primary' | 'secondary' | 'knife' | 'grenade' | 'objective';

export interface GameEventMap {
  round_start: { round: number };
  round_live: { round: number; timeSec: number };
  round_end: { round: number; winner: TeamId; reason: string };
  match_end: { winner: TeamId; score: [number, number] };
  player_spawn: { playerId: number };
  player_death: { victimId: number; attackerId: number | null; weaponId: string; region: HitRegion; headshot: boolean };
  player_damage: { victimId: number; attackerId: number | null; amount: number; region: HitRegion };
  bomb_picked: { playerId: number };
  bomb_dropped: { pos: Vec3 };
  bomb_plant_start: { playerId: number; site: string };
  bomb_plant_abort: {};
  bomb_planted: { site: string; playerId: number };
  bomb_defuse_start: { playerId: number; hasKit: boolean };
  bomb_defuse_abort: {};
  bomb_defused: { site: string; playerId: number };
  bomb_exploded: { site: string };
  weapon_fired: { shooterId: number; weaponId: string; pos: Vec3; loudness: number };
  bullet_impact: { pos: Vec3; normal: Vec3; material: string };
  grenade_thrown: { playerId: number; pos: Vec3 };
  grenade_exploded: { pos: Vec3; radius: number };
  footstep: { playerId: number; pos: Vec3; loudness: number };
  bomb_beep: { pos: Vec3 };
  bot_added: { playerId: number };
  bot_removed: { playerId: number };
  announce: { text: string; sub?: string };
  hud_flash: { severity: number }; // damage feedback for the local player
  local_player_dead: {};
  buy_done: { playerId: number };
}

type Handler<P> = (payload: P) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<never>>>();

  on<K extends keyof GameEventMap>(type: K, fn: Handler<GameEventMap[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(type, fn);
  }

  off<K extends keyof GameEventMap>(type: K, fn: Handler<GameEventMap[K]>): void {
    this.handlers.get(type)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        (fn as Handler<GameEventMap[K]>)(payload);
      } catch (err) {
        // A broken presentation listener must never kill the simulation.
        console.error(`[EventBus] handler for "${type}" threw:`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
