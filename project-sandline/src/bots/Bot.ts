// Bot: aggregates perception, aim, movement, combat and objective behavior
// into a PlayerCommand each tick. Bots may only act on perceived information
// (design doc 19.2) - never on raw enemy positions.

import { PlayerEntity, PlayerCommand } from '../player/PlayerEntity';
import { emptyCommand } from '../sim/Match';
import { RNG } from '../core/RNG';
import { Vec3, vec3 } from '../core/math';
import { difficulties, DifficultyParams } from '../world/DataFiles';
import type { RoundSnapshot } from '../rules/RoundManager';
import { GameWorldApi } from './types';
import { BotPerception } from './BotPerception';
import { BotAim } from './BotAim';
import { BotMovement } from './BotMovement';
import { BotCombat } from './BotCombat';
import { BotObjective } from './BotObjective';

export class Bot {
  entity: PlayerEntity;
  difficulty: DifficultyParams;
  api: GameWorldApi;
  rng: RNG;
  perception: BotPerception;
  aim: BotAim;
  movement: BotMovement;
  combat: BotCombat;
  objective: BotObjective;

  /** Blackboard (design doc 19.3). */
  visibleEnemyIds: number[] = [];
  targetEnemyId: number | null = null;
  lastSeenPos: Vec3 | null = null;
  lastSeenAt = -999;
  lastHeardPos: Vec3 | null = null;
  lastHeardAt = -999;
  isUnderFire = false;
  /** True when a tactical target is currently driving movement. */
  movingTo: Vec3 | null = null;
  arrived = false;
  strafeDir = 0;
  wantCrouch = false;
  /** Fire intent from combat (subject to aim alignment). */
  fireIntent = false;
  wantReload = false;
  wantSwitchSlot = null as PlayerCommand['switchSlot'];
  wantThrowGrenade = false;
  wantUsePressed = false;
  wantUseHeld = false;
  /** Objective assigned at round start. */
  assignedSite: string | null = null;
  boughtThisRound = false;

  constructor(entity: PlayerEntity, api: GameWorldApi, difficultyId: string, seed: number) {
    this.entity = entity;
    this.api = api;
    this.difficulty = difficulties[difficultyId] ?? difficulties.normal;
    this.rng = new RNG(seed);
    this.perception = new BotPerception(this);
    this.aim = new BotAim(this);
    this.movement = new BotMovement(this);
    this.combat = new BotCombat(this);
    this.objective = new BotObjective(this);
  }

  get pos(): Vec3 {
    return this.entity.pos;
  }

  get alive(): boolean {
    return this.entity.alive;
  }

  update(dt: number, snap: RoundSnapshot): PlayerCommand {
    const cmd = emptyCommand();
    if (!this.entity.alive) return cmd;

    if (snap.phase === 'freeze') {
      if (!this.boughtThisRound && this.api.buyingAllowed()) {
        this.doBuy();
        this.boughtThisRound = true;
      }
      return cmd;
    }
    if (snap.phase !== 'live') return cmd;

    this.perception.update(dt);
    this.combat.update(dt);
    this.objective.update(dt, snap);
    this.movement.update(dt);

    // Aim drives the view angles; movement only turns when not fighting.
    const engaged = this.combat.engaged;
    this.aim.update(dt, engaged);

    cmd.forward = this.movement.forward;
    cmd.right = this.movement.right;
    cmd.run = this.movement.run;
    cmd.crouch = this.wantCrouch || this.movement.crouchRequest;
    cmd.fire = this.fireIntent && this.aim.onTarget;
    cmd.reload = this.wantReload;
    cmd.switchSlot = this.wantSwitchSlot;
    cmd.throwGrenade = this.wantThrowGrenade;
    cmd.grenadePower = 0.65;
    cmd.usePressed = this.wantUsePressed;
    cmd.use = this.wantUseHeld;
    cmd.jump = false;
    return cmd;
  }

  /** Round-start purchase decision (simple, difficulty-independent v1). */
  private doBuy(): void {
    const p = this.entity;
    const money = p.money;
    if (money < 700) return;
    if (money < 1900) {
      // Light buy: armor or nothing.
      if (money >= 1000 && this.rng.next() < 0.6) this.apiTryBuy('vesthelm');
      else if (money >= 650 && this.rng.next() < 0.5) this.apiTryBuy('vest');
      if (this.rng.next() < 0.3) this.apiTryBuy('grenade_frag');
      return;
    }
    if (money < 2900) {
      // Eco/SMG buy.
      if (this.rng.next() < 0.5) this.apiTryBuy('smg_light');
      if (this.rng.next() < 0.7) this.apiTryBuy('vesthelm');
      else this.apiTryBuy('vest');
      if (this.rng.next() < 0.4) this.apiTryBuy('grenade_frag');
      return;
    }
    // Full buy.
    const primary = p.team === 'attackers' ? 'rifle_attacker_primary' : 'rifle_defender_primary';
    if (this.rng.next() < 0.85) this.apiTryBuy(primary);
    if (p.team === 'defenders' && this.rng.next() < 0.5) this.apiTryBuy('defusekit');
    this.apiTryBuy('vesthelm');
    if (this.rng.next() < 0.5) this.apiTryBuy('grenade_frag');
  }

  private apiTryBuy(item: string): void {
    // Type-safe call through the match via the entity update path is complex;
    // the manager wires a buy hook instead.
    this.buyHook?.(item);
  }

  /** Wired by BotManager to the match buy system. */
  buyHook: ((item: string) => void) | null = null;
}
