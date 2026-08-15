// Match: the headless game orchestrator. Owns the world, players, bots,
// round manager, economy, buy system, bomb and grenades. Pure simulation -
// no rendering, no DOM - so it runs identically in the browser, in vitest
// and in the headless sim tool (design doc 4, 6.2).

import { EventBus, TeamId, HitRegion } from '../core/EventBus';
import { RNG } from '../core/RNG';
import { Vec3, vec3, distXZ, normalize, yawForward, yawRight } from '../core/math';
import { CollisionWorld } from '../world/CollisionWorld';
import { buildMap, BuiltMap } from '../world/MapBuilder';
import { getMapData, movement, RoundParams, round } from '../world/DataFiles';
import { MapData } from '../world/MapData';
import { WaypointGraph } from '../nav/WaypointGraph';
import { PlayerEntity, PlayerCommand } from '../player/PlayerEntity';
import { WeaponRegistry } from '../weapons/WeaponRegistry';
import { WeaponInstance } from '../weapons/WeaponInstance';
import { WeaponSpec } from '../weapons/WeaponRegistry';
import { bodyBounds, hitRegionAt, rayAABB } from '../combat/Hitbox';
import { RoundManager, RoundHost, RoundSnapshot } from '../rules/RoundManager';
import { Economy } from '../rules/Economy';
import { BuySystem, BuyContext, BuyItemId } from '../rules/BuySystem';
import { enemyOf } from '../rules/Team';
import { MatchSettings, resolveBotSplit } from '../rules/MatchConfig';
import { BombObjective, BombActor } from '../objectives/BombObjective';
import { GrenadeSim } from './GrenadeSim';
import { GameWorldApi } from '../bots/types';
import { BotManager } from '../bots/BotManager';

const MAX_DIST = 300;

export class Match implements RoundHost, GameWorldApi {
  eventBus = new EventBus();
  rng: RNG;
  registry = new WeaponRegistry();
  economy = new Economy();
  buySystem = new BuySystem(this.registry);
  roundManager: RoundManager;
  builtMap: BuiltMap;
  navGraph = new WaypointGraph();
  playerMap = new Map<number, PlayerEntity>();
  bots: BotManager;
  bomb: BombObjective;
  grenades: GrenadeSim[] = [];
  timeSec = 0;
  paused = false;
  training = false;
  /** Dev flags (console). */
  godMode = false;
  noclip = false;
  settings: MatchSettings;
  humanId = 0;
  /** Command from the local player; set by GameApp each frame. */
  humanCmd: PlayerCommand = emptyCommand();
  private useHeld = new Map<number, boolean>();
  private defusingPlayerId: number | null = null;
  private dummyRespawns = new Map<number, number>();
  private bombSiteEventsWired = false;

  constructor(settings: MatchSettings, seed?: number) {
    this.settings = settings;
    const mapData = getMapData(settings.mapId);
    this.training = mapData.mode === 'training';
    this.rng = new RNG(seed ?? (settings.matchSeed || Math.floor(Math.random() * 0x7fffffff)));
    this.builtMap = buildMap(mapData);
    this.navGraph.build(this.builtMap.waypoints, this.builtMap.collision);
    this.bomb = new BombObjective(this.eventBus, mapData.bombSites, round);
    this.roundManager = new RoundManager({ ...round, maxRounds: settings.maxRounds || round.maxRounds });
    this.bots = new BotManager(this, settings.botDifficulty);
    this.wireEvents();
  }

  // ---- GameWorldApi ---------------------------------------------------

  get collision(): CollisionWorld {
    return this.builtMap.collision;
  }

  get mapData(): MapData {
    return this.builtMap.data;
  }

  nowMs(): number {
    return this.timeSec * 1000;
  }

  time(): number {
    return this.timeSec;
  }

  mode(): 'bomb' | 'training' {
    return this.training ? 'training' : 'bomb';
  }

  roundSnapshot(): RoundSnapshot {
    return this.roundManager.snapshot();
  }

  frozen(): boolean {
    return this.training ? false : this.roundManager.frozen;
  }

  buyingAllowed(): boolean {
    if (this.training) return true;
    return this.roundManager.buyingAllowed();
  }

  enemiesOf(team: TeamId): PlayerEntity[] {
    return this.players().filter((p) => p.team === enemyOf(team) && p.alive);
  }

  playerById(id: number): PlayerEntity | undefined {
    return this.playerMap.get(id);
  }

  addPlayer(entity: PlayerEntity): void {
    this.playerMap.set(entity.id, entity);
  }

  players(): PlayerEntity[] {
    return [...this.playerMap.values()];
  }

  nearestNode(p: { x: number; y: number; z: number }): number {
    return this.navGraph.nearestNode(vec3(p.x, p.y, p.z));
  }

  siteNodes(siteId: string): Vec3[] {
    const site = this.mapData.bombSites.find((s) => s.id === siteId);
    if (!site) return [];
    const out: Vec3[] = [];
    for (const n of this.navGraph.nodes) {
      const dx = n.x - site.center[0];
      const dz = n.z - site.center[1];
      if (Math.sqrt(dx * dx + dz * dz) <= site.radius + 3) out.push(n);
    }
    return out;
  }

  buyZoneNodes(): Vec3[] {
    const out: Vec3[] = [];
    for (const n of this.navGraph.nodes) {
      for (const z of this.mapData.buyZones) {
        const dx = n.x - z.center[0];
        const dz = n.z - z.center[1];
        if (Math.sqrt(dx * dx + dz * dz) <= z.radius) {
          out.push(n);
          break;
        }
      }
    }
    return out;
  }

  randomSiteId(): string {
    return this.rng.pick(this.mapData.bombSites).id;
  }

  enemySites(): { id: string; center: [number, number]; radius: number }[] {
    return this.mapData.bombSites.map((s) => ({ id: s.id, center: s.center, radius: s.radius }));
  }

  // ---- Setup ----------------------------------------------------------

  private wireEvents(): void {
    if (this.bombSiteEventsWired) return;
    this.bombSiteEventsWired = true;
    this.eventBus.on('bomb_planted', (e) => {
      this.roundManager.notifyBombPlanted();
      this.awardPlayer(e.playerId, 'BOMB_PLANT');
    });
    this.eventBus.on('bomb_defused', (e) => {
      this.awardPlayer(e.playerId, 'BOMB_DEFUSE');
      this.roundManager.notifyBombResolved(this);
    });
    this.eventBus.on('bomb_exploded', () => {
      this.roundManager.notifyBombResolved(this);
    });
  }

  spawnPlayers(): void {
    const mapData = this.mapData;
    for (const p of this.players()) {
      const spawns = p.team === 'attackers' ? mapData.spawns.attackers : mapData.spawns.defenders;
      const list = spawns.length > 0 ? spawns : mapData.spawns.attackers;
      const spawn = this.rng.pick(list);
      const startPistol = p.team === 'attackers' ? 'pistol_attacker_start' : 'pistol_defender_start';
      p.spawn(vec3(spawn.pos[0], spawn.pos[1], spawn.pos[2]), spawn.yaw, startPistol);
      this.useHeld.set(p.id, false);
      this.eventBus.emit('player_spawn', { playerId: p.id });
    }
    this.defusingPlayerId = null;
  }

  assignBomb(): void {
    for (const p of this.players()) p.inventory.hasBomb = false;
    const attackers = this.players().filter((p) => p.team === 'attackers' && p.alive);
    if (attackers.length === 0) return;
    const carrier = this.rng.pick(attackers);
    carrier.inventory.hasBomb = true;
    this.bomb.state = 'carried';
    this.bomb.carrierId = carrier.id;
    this.bomb.site = null;
    this.bomb.progress = 0;
    this.bomb.timer = round.bombTimerSec;
    this.eventBus.emit('announce', {
      text: carrier.isBot ? `${carrier.name} has the detonator` : 'You have the detonator',
    });
  }

  switchSides(): void {
    for (const p of this.players()) {
      if (p.team === 'attackers') p.team = 'defenders';
      else if (p.team === 'defenders') p.team = 'attackers';
      p.money = this.economy.startMoney();
      p.lossStreak = 0;
    }
  }

  /** Add the human player. */
  addHuman(team: TeamId): PlayerEntity {
    const p = new PlayerEntity(this.humanId, 'You', team, false, this.registry);
    this.playerMap.set(p.id, p);
    return p;
  }

  startMatch(): void {
    this.timeSec = 0;
    if (this.training) {
      this.startTraining();
      return;
    }
    for (const p of this.players()) p.money = this.economy.startMoney();
    this.bots.fill(resolveBotSplit(this.settings));
    this.roundManager.startRound(this);
  }

  private startTraining(): void {
    const mapData = this.mapData;
    const spawn = mapData.spawns.attackers[0] ?? { pos: [0, 0, 0], yaw: 0 };
    const human = this.playerById(this.humanId);
    if (human) {
      human.spawn(vec3(spawn.pos[0], spawn.pos[1], spawn.pos[2]), spawn.yaw, 'pistol_defender_start');
      human.money = 16000;
    }
    // Static dummies.
    let id = 1000;
    for (const d of mapData.dummies) {
      const dummy = new PlayerEntity(id, `Dummy ${id - 999}`, 'spectator', true, this.registry);
      dummy.spawn(vec3(d[0], d[1], d[2]), d[3], 'pistol_defender_start');
      dummy.health = 100;
      this.playerMap.set(id, dummy);
      id++;
    }
  }

  // ---- RoundHost ------------------------------------------------------

  onMatchEnd(_winner: TeamId): void {
    // Bots stop acting on their own when the round snapshot is match_end.
  }

  setPlayerFrozen(_playerId: number, _frozen: boolean): void {
    // Freeze is enforced via the round snapshot in step(); nothing per player.
  }

  awardPlayer(playerId: number, event: 'BOMB_PLANT' | 'BOMB_DEFUSE'): void {
    const p = this.playerMap.get(playerId);
    if (!p) return;
    p.money = this.economy.apply(p.money, { type: event });
  }

  // ---- Simulation -----------------------------------------------------

  step(dt: number): void {
    if (this.paused) return;
    this.timeSec += dt;
    const now = this.nowMs();

    if (!this.training) {
      this.roundManager.update(dt, this);
    }

    const frozen = this.frozen();
    const snap = this.roundSnapshot();
    const canAct = this.training || (snap.phase === 'live' && !frozen);

    // Bots think and produce commands.
    if (!this.training) this.bots.update(dt, snap);

    for (const p of this.players()) {
      if (p.isBot && p.team === 'spectator') continue; // dummies never move
      const cmd = p.id === this.humanId ? this.humanCmd : this.bots.commandFor(p.id);
      const ctx = {
        now,
        rng: this.rng,
        world: this.collision,
        eventBus: this.eventBus,
        canMove: this.training || (snap.phase === 'live' && !frozen && p.alive),
        canFire: canAct && p.alive,
        resolveShot: (shooter: PlayerEntity, spec: WeaponSpec, origin: Vec3, dir: Vec3) =>
          this.resolveShot(shooter, spec, origin, dir),
        throwGrenade: (shooter: PlayerEntity, spec: WeaponSpec, power: number, dir: Vec3) =>
          this.throwGrenade(shooter, spec, power, dir),
        onUse: (player: PlayerEntity) => this.handleUse(player),
      };
      if (this.noclip && p.id === this.humanId && p.alive) {
        // Dev noclip: free movement through the world.
        const f = yawForward(p.yaw);
        const r = yawRight(p.yaw);
        const sp = 9;
        p.motor.pos.x += (f.x * cmd.forward + r.x * cmd.right) * sp * dt;
        p.motor.pos.z += (f.z * cmd.forward + r.z * cmd.right) * sp * dt;
        p.motor.pos.y += ((cmd.jump ? 1 : 0) - (cmd.crouch ? 1 : 0)) * sp * dt;
        p.motor.vel = vec3(0, 0, 0);
        p.update(dt, { ...cmd, forward: 0, right: 0, jump: false }, ctx);
      } else {
        p.update(dt, cmd, ctx);
      }
      this.useHeld.set(p.id, cmd.use);
    }

    // Bomb carrier/defuser actors (use must be held for progress).
    const carrier = this.bomb.carrierId !== null ? this.playerMap.get(this.bomb.carrierId) : undefined;
    const carrierActor: BombActor | null =
      carrier && this.useHeld.get(carrier.id) ? carrier : null;
    let defuserActor: BombActor | null = null;
    if (this.defusingPlayerId !== null) {
      const def = this.playerMap.get(this.defusingPlayerId);
      if (def && this.useHeld.get(def.id) && def.alive) defuserActor = def;
      else {
        this.bomb.abortDefuse();
        this.defusingPlayerId = null;
      }
    }
    this.bomb.update(dt, carrierActor, defuserActor);
    if (this.bomb.state === 'defused' || this.bomb.state === 'detonated') {
      this.defusingPlayerId = null;
    }

    // Grenades.
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      const done = g.update(dt, this.collision);
      if (done) {
        this.explodeAt(g.pos, g.radius, g.damage, g.ownerTeam, g.ownerId, 'grenade_frag');
        this.eventBus.emit('grenade_exploded', { pos: vec3(g.pos.x, g.pos.y, g.pos.z), radius: g.radius });
        this.grenades.splice(i, 1);
      }
    }

    // Training: dummy respawns and human respawn.
    if (this.training) {
      const human = this.playerMap.get(this.humanId);
      if (human && !human.alive) {
        const spawn = this.mapData.spawns.attackers[0] ?? { pos: [0, 0, 0], yaw: 0 };
        human.spawn(vec3(spawn.pos[0], spawn.pos[1], spawn.pos[2]), spawn.yaw, 'pistol_defender_start');
      }
      for (const [id, t] of [...this.dummyRespawns]) {
        if (t <= this.timeSec) {
          const d = this.playerMap.get(id);
          if (d) {
            d.alive = true;
            d.health = 100;
          }
          this.dummyRespawns.delete(id);
        }
      }
    }
  }

  /** Hitscan resolution: nearest entity vs wall. */
  resolveShot(shooter: PlayerEntity, spec: WeaponSpec, origin: Vec3, dir: Vec3): void {
    const d = normalize(dir);
    const wallHit = this.collision.raycast(origin, d, MAX_DIST);

    let bestT = wallHit.hit ? wallHit.distance : MAX_DIST;
    let bestTarget: PlayerEntity | null = null;
    let bestPoint: Vec3 | null = null;

    for (const target of this.players()) {
      if (target === shooter || !target.alive) continue;
      if (!this.training && target.team === shooter.team) continue;
      if (this.training && target.team !== 'spectator') continue;
      const bounds = bodyBounds(target);
      const t = rayAABB(origin, d, bounds.min, bounds.max, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        bestTarget = target;
        bestPoint = vec3(origin.x + d.x * t, origin.y + d.y * t, origin.z + d.z * t);
      }
    }

    if (bestTarget && bestPoint) {
      const region = hitRegionAt(bestTarget, bestPoint);
      this.applyShotDamage(shooter, bestTarget, spec, region, bestT);
    } else if (wallHit.hit) {
      this.eventBus.emit('bullet_impact', {
        pos: vec3(wallHit.point.x, wallHit.point.y, wallHit.point.z),
        normal: vec3(wallHit.normal.x, wallHit.normal.y, wallHit.normal.z),
        material: wallHit.material,
      });
    }
  }

  private applyShotDamage(
    shooter: PlayerEntity,
    victim: PlayerEntity,
    spec: WeaponSpec,
    region: HitRegion,
    distance: number,
  ): void {
    if (this.godMode && victim.id === this.humanId) return;
    const dmg = victim.receiveDamage(spec, region, distance, shooter.id, this.timeSec);
    this.eventBus.emit('player_damage', {
      victimId: victim.id,
      attackerId: shooter.id,
      amount: dmg,
      region,
    });
    // Team damage penalty.
    if (!this.training && shooter.team === victim.team && shooter.id !== victim.id) {
      shooter.money = this.economy.apply(shooter.money, { type: 'TEAM_DAMAGE_PENALTY', amount: dmg });
    }
    if (!victim.alive) {
      this.killPlayer(victim, shooter, spec, region === 'head');
    }
  }

  killPlayer(
    victim: PlayerEntity,
    attacker: PlayerEntity | null,
    spec: WeaponSpec | null,
    headshot = false,
  ): void {
    if (!victim.alive) {
      // Guard double-kill (multi-pellet shots).
      victim.health = 0;
    }
    victim.kill(attacker?.id ?? null);
    if (attacker) {
      attacker.kills++;
      attacker.money = this.economy.apply(attacker.money, { type: 'KILL', amount: spec?.killReward ?? 0 });
      if (!this.training && attacker.team === victim.team && attacker.id !== victim.id) {
        attacker.money = this.economy.apply(attacker.money, { type: 'TEAM_KILL_PENALTY' });
      }
    }
    // Drop the bomb.
    if (this.bomb.carrierId === victim.id && this.bomb.state === 'carried') {
      this.bomb.drop();
      this.useHeld.set(victim.id, false);
    }
    this.eventBus.emit('player_death', {
      victimId: victim.id,
      attackerId: attacker?.id ?? null,
      weaponId: spec?.id ?? '',
      region: 'chest',
      headshot,
    });
    if (victim.id === this.humanId) this.eventBus.emit('local_player_dead', {});
    if (!this.training) this.roundManager.notifyDeath(victim, this);
    if (this.training && victim.team === 'spectator') {
      this.dummyRespawns.set(victim.id, this.timeSec + 2.5);
    }
  }

  throwGrenade(shooter: PlayerEntity, spec: WeaponSpec, power: number, dir: Vec3): void {
    const speed = 8 + 13 * Math.min(1, Math.max(0.1, power));
    const vel = vec3(dir.x * speed, dir.y * speed + 3.2, dir.z * speed);
    this.grenades.push(
      new GrenadeSim(
        shooter.eyePos(),
        vel,
        spec.grenadeFuseSec,
        spec.grenadeRadius,
        spec.damage,
        shooter.id,
        shooter.team,
      ),
    );
    this.eventBus.emit('grenade_thrown', { playerId: shooter.id, pos: shooter.eyePos() });
  }

  explodeAt(pos: Vec3, radius: number, damage: number, sourceTeam: TeamId, sourceId: number, weaponId: string): void {
    const source = this.playerMap.get(sourceId);
    for (const victim of this.players()) {
      if (!victim.alive) continue;
      if (this.training) {
        if (victim.team !== 'spectator') continue;
      } else if (victim.team === sourceTeam) {
        continue; // no friendly fire from explosions in MVP
      }
      const d = distXZ(victim.pos, pos) + Math.abs(victim.pos.y - pos.y) * 0.5;
      if (d > radius) continue;
      // Line of sight: walls block explosion damage.
      const from = vec3(pos.x, pos.y + 0.3, pos.z);
      const to = vec3(victim.pos.x, victim.pos.y + 1.2, victim.pos.z);
      if (!this.collision.segmentClear(from, to)) continue;
      const falloff = 1 - d / radius;
      const spec: WeaponSpec = {
        ...this.registry.get('grenade_frag'),
        id: weaponId,
        damage: damage * falloff,
        hitRegionMultipliers: { head: 1, chest: 1, stomach: 1, arm: 1, leg: 1 },
        rangeModifier: 1,
      };
      const before = victim.health;
      const dmg = victim.receiveDamage(spec, 'chest', 0, sourceId, this.timeSec);
      void before;
      this.eventBus.emit('player_damage', {
        victimId: victim.id,
        attackerId: sourceId,
        amount: dmg,
        region: 'chest',
      });
      if (!victim.alive) this.killPlayer(victim, source ?? null, spec, false);
    }
  }

  handleUse(player: PlayerEntity): void {
    if (this.training) return;
    const snap = this.roundSnapshot();
    if (snap.phase !== 'live') return;
    if (this.bomb.state === 'dropped') {
      this.bomb.pickup(player);
      return;
    }
    if (player.team === 'attackers' && this.bomb.state === 'carried' && this.bomb.carrierId === player.id) {
      if (this.bomb.siteAt(player.pos)) this.bomb.startPlant(player);
      return;
    }
    if (player.team === 'defenders' && this.bomb.state === 'planted' && this.defusingPlayerId === null) {
      if (this.bomb.startDefuse(player)) this.defusingPlayerId = player.id;
    }
  }

  // ---- Buy ------------------------------------------------------------

  buyContextFor(player: PlayerEntity): BuyContext {
    return {
      inBuyZone: this.mapData.buyZones.some((z) => {
        const dx = player.pos.x - z.center[0];
        const dz = player.pos.z - z.center[1];
        return Math.sqrt(dx * dx + dz * dz) <= z.radius;
      }),
      buyTimeActive: this.buyingAllowed(),
      buyingAllowed: this.buyingAllowed(),
    };
  }

  tryBuy(playerId: number, item: BuyItemId): boolean {
    const player = this.playerMap.get(playerId);
    if (!player) return false;
    const res = this.buySystem.buy(player, item, this.buyContextFor(player));
    if (res.ok) this.eventBus.emit('buy_done', { playerId });
    return res.ok;
  }

  giveWeaponCheat(playerId: number, weaponId: string): boolean {
    const player = this.playerMap.get(playerId);
    if (!player || !this.registry.has(weaponId)) return false;
    if (weaponId === 'grenade_frag') {
      player.addGrenade(weaponId);
      return true;
    }
    player.giveWeapon(weaponId, true);
    return true;
  }

  /** Dispose helper: nothing heavy to free in the headless sim. */
  dispose(): void {
    this.playerMap.clear();
    this.grenades = [];
    this.eventBus.clear();
  }
}

export function emptyCommand(): PlayerCommand {
  return {
    forward: 0,
    right: 0,
    run: true,
    crouch: false,
    jump: false,
    fire: false,
    reload: false,
    altFire: false,
    fireModeSwitch: false,
    switchSlot: null,
    use: false,
    usePressed: false,
    throwGrenade: false,
    grenadePower: undefined,
  };
}
