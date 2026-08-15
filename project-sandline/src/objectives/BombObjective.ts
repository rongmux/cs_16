// Bomb objective state machine (design doc 16.2):
// CARRIED -> DROPPED -> (PICKED_UP) -> PLANTING -> PLANTED
//   -> DETONATED | DEFUSING -> DEFUSED
// Emits ObjectiveEvents only; the RoundManager is the sole authority that
// ends rounds (design doc 7.1, 85).

import { Vec3, vec3, distXZ } from '../core/math';
import type { EventBus } from '../core/EventBus';
import { round, RoundParams } from '../world/DataFiles';
import type { BombSiteDef } from '../world/MapData';

export type BombState =
  | 'carried'
  | 'dropped'
  | 'planting'
  | 'planted'
  | 'defusing'
  | 'defused'
  | 'detonated';

/** Minimal player view needed by the bomb. */
export interface BombActor {
  id: number;
  pos: Vec3;
  alive: boolean;
  team: 'attackers' | 'defenders' | 'spectator';
  defuseKit: boolean;
}

export class BombObjective {
  state: BombState = 'dropped';
  carrierId: number | null = null;
  pos: Vec3 = vec3(0, 0, 0);
  site: string | null = null;
  /** Plant/defuse progress in seconds. */
  progress = 0;
  /** Detonation countdown (seconds) while planted. */
  timer = 0;
  beepAccum = 0;
  private params: RoundParams;
  private lastCarrierPos: Vec3 | null = null;

  constructor(
    private eventBus: EventBus,
    private sites: BombSiteDef[],
    params: RoundParams = round,
    /** Radial explosion effect, wired by the match. */
    public onExplode: ((pos: Vec3) => void) | null = null,
  ) {
    this.params = params;
    this.timer = params.bombTimerSec;
  }

  siteAt(p: Vec3): BombSiteDef | null {
    for (const s of this.sites) {
      const dx = p.x - s.center[0];
      const dz = p.z - s.center[1];
      if (Math.sqrt(dx * dx + dz * dz) <= s.radius) return s;
    }
    return null;
  }

  isInSite(p: Vec3): boolean {
    return this.siteAt(p) !== null;
  }

  pickup(actor: BombActor): boolean {
    if (this.state !== 'dropped' && this.state !== 'carried') return false;
    if (actor.team !== 'attackers') return false;
    if (!actor.alive) return false;
    if (distXZ(actor.pos, this.pos) > 1.6) return false;
    this.state = 'carried';
    this.carrierId = actor.id;
    this.eventBus.emit('bomb_picked', { playerId: actor.id });
    return true;
  }

  /** Called by the match when the carrier dies or drops. */
  drop(): void {
    if (this.state !== 'carried') return;
    this.state = 'dropped';
    this.carrierId = null;
    this.progress = 0;
    if (this.lastCarrierPos) this.pos = vec3(this.lastCarrierPos.x, this.lastCarrierPos.y, this.lastCarrierPos.z);
    this.eventBus.emit('bomb_dropped', { pos: vec3(this.pos.x, this.pos.y, this.pos.z) });
  }

  startPlant(actor: BombActor): boolean {
    if (this.state !== 'carried') return false;
    if (this.carrierId !== actor.id) return false;
    const site = this.siteAt(actor.pos);
    if (!site) return false;
    this.state = 'planting';
    this.progress = 0;
    this.site = site.id;
    this.eventBus.emit('bomb_plant_start', { playerId: actor.id, site: site.id });
    return true;
  }

  updatePlant(dt: number, actor: BombActor | null): void {
    if (this.state !== 'planting') return;
    // Abort when the planter died, moved away from the site, or released use.
    if (!actor || !actor.alive || actor.id !== this.carrierId) {
      this.abortPlant();
      return;
    }
    const site = this.siteAt(actor.pos);
    if (!site || site.id !== this.site) {
      this.abortPlant();
      return;
    }
    this.progress += dt;
    if (this.progress >= this.params.bombPlantTimeSec) {
      this.state = 'planted';
      this.progress = 0;
      this.timer = this.params.bombTimerSec;
      this.carrierId = null;
      this.pos = vec3(actor.pos.x, actor.pos.y, actor.pos.z);
      this.eventBus.emit('bomb_planted', { site: this.site ?? '?', playerId: actor.id });
    }
  }

  abortPlant(): void {
    if (this.state !== 'planting') return;
    this.state = 'carried';
    this.progress = 0;
    this.eventBus.emit('bomb_plant_abort', {});
  }

  startDefuse(actor: BombActor): boolean {
    if (this.state !== 'planted') return false;
    if (actor.team !== 'defenders') return false;
    if (!actor.alive) return false;
    const site = this.siteAt(actor.pos);
    if (!site || site.id !== this.site) return false;
    this.state = 'defusing';
    this.progress = 0;
    this.eventBus.emit('bomb_defuse_start', { playerId: actor.id, hasKit: actor.defuseKit });
    return true;
  }

  updateDefuse(dt: number, actor: BombActor | null): void {
    if (this.state !== 'defusing') return;
    if (!actor || !actor.alive) {
      this.abortDefuse();
      return;
    }
    const site = this.siteAt(actor.pos);
    if (!site || site.id !== this.site) {
      this.abortDefuse();
      return;
    }
    this.progress += dt;
    const need = actor.defuseKit ? this.params.bombDefuseKitTimeSec : this.params.bombDefuseTimeSec;
    if (this.progress >= need) {
      this.state = 'defused';
      this.eventBus.emit('bomb_defused', { site: this.site ?? '?', playerId: actor.id });
    }
  }

  abortDefuse(): void {
    if (this.state !== 'defusing') return;
    this.state = 'planted';
    this.progress = 0;
    this.eventBus.emit('bomb_defuse_abort', {});
  }

  detonate(): void {
    if (this.state !== 'planted') return;
    this.state = 'detonated';
    this.eventBus.emit('bomb_exploded', { site: this.site ?? '?' });
    this.onExplode?.(vec3(this.pos.x, this.pos.y, this.pos.z));
  }

  update(dt: number, carrier: BombActor | null, defuser: BombActor | null): void {
    if (this.state === 'carried' && carrier?.alive) {
      this.lastCarrierPos = vec3(carrier.pos.x, carrier.pos.y, carrier.pos.z);
      this.pos = this.lastCarrierPos;
    }
    if (this.state === 'planting') this.updatePlant(dt, carrier);
    if (this.state === 'defusing') this.updateDefuse(dt, defuser);
    if (this.state === 'planted') {
      this.timer -= dt;
      // Beeps, accelerating near detonation.
      this.beepAccum += dt;
      const interval = this.timer < this.params.bombBeepStartSec ? 0.35 : 0.9;
      if (this.beepAccum >= interval) {
        this.beepAccum = 0;
        this.eventBus.emit('bomb_beep', { pos: vec3(this.pos.x, this.pos.y, this.pos.z) });
      }
      if (this.timer <= 0) this.detonate();
    }
  }

  reset(sites: BombSiteDef[]): void {
    this.state = 'dropped';
    this.carrierId = null;
    this.pos = vec3(0, -100, 0);
    this.site = null;
    this.progress = 0;
    this.timer = this.params.bombTimerSec;
    this.beepAccum = 0;
    this.lastCarrierPos = null;
    this.sites = sites;
  }

  /** Position to render. */
  displayPos(): Vec3 {
    return this.pos;
  }
}
