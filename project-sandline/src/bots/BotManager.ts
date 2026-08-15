// BotManager: spawns/removes bots, updates them with throttled behavior,
// shares team "radio" last-seen info, and handles console ai_* commands
// (design doc 20).

import { PlayerEntity } from '../player/PlayerEntity';
import { emptyCommand } from '../sim/Match';
import { vec3 } from '../core/math';
import { difficulties } from '../world/DataFiles';
import { GameWorldApi } from './types';
import { Bot } from './Bot';
import type { RoundSnapshot } from '../rules/RoundManager';

export interface BotSplit {
  attackers: number;
  defenders: number;
}

export class BotManager {
  bots: Bot[] = [];
  private commands = new Map<number, ReturnType<typeof emptyCommand>>();
  private nextId = 1;
  private difficultyId: string;
  /** Team radio: latest shared enemy sighting per team. */
  private radio = new Map<string, { pos: { x: number; y: number; z: number }; at: number }>();
  private split: BotSplit = { attackers: 0, defenders: 0 };

  constructor(private api: GameWorldApi, difficultyId: string) {
    this.difficultyId = difficultyId;
    api.eventBus.on('round_start', () => {
      for (const b of this.bots) {
        b.boughtThisRound = false;
        b.objective.resetRound();
        b.wantUseHeld = false;
        b.wantUsePressed = false;
        b.targetEnemyId = null;
        b.lastSeenPos = null;
        b.lastHeardPos = null;
        b.combat.engaged = false;
      }
      this.radio.clear();
    });
  }

  get count(): number {
    return this.bots.length;
  }

  setDifficulty(id: string): void {
    this.difficultyId = id;
    const params = difficulties[id] ?? difficulties.normal;
    for (const b of this.bots) {
      b.difficulty = params;
    }
  }

  /** Create bots to match the configured split (idempotent fill). */
  fill(split?: BotSplit): void {
    if (split) this.split = split;
    const attackers = this.bots.filter((b) => b.entity.team === 'attackers').length;
    const defenders = this.bots.filter((b) => b.entity.team === 'defenders').length;
    for (let i = attackers; i < this.split.attackers; i++) this.spawnBot('attackers');
    for (let i = defenders; i < this.split.defenders; i++) this.spawnBot('defenders');
  }

  private spawnBot(team: 'attackers' | 'defenders'): Bot {
    const id = this.nextId++;
    const n = this.bots.filter((b) => b.entity.team === team).length + 1;
    const name = team === 'attackers' ? `Raider ${n}` : `Unit ${n}`;
    const entity = new PlayerEntity(id, name, team, true, this.api.registry);
    const bot = new Bot(entity, this.api, this.difficultyId, this.api.rng.int(1, 0x7fffffff));
    bot.buyHook = (item: string) => this.api.tryBuy(entity.id, item);
    this.api.addPlayer(entity);
    this.bots.push(bot);
    this.commands.set(id, emptyCommand());
    this.api.eventBus.emit('bot_added', { playerId: id });
    return bot;
  }

  /** Add one bot on demand (console ai_add). */
  addBot(team: 'attackers' | 'defenders'): number {
    const bot = this.spawnBot(team);
    // Spawn immediately at the team's first spawn point.
    const spawns =
      team === 'attackers' ? this.api.mapData.spawns.attackers : this.api.mapData.spawns.defenders;
    if (spawns.length > 0) {
      const s = spawns[bot.entity.id % spawns.length];
      bot.entity.spawn(vec3(s.pos[0], s.pos[1], s.pos[2]), s.yaw, team === 'attackers' ? 'pistol_attacker_start' : 'pistol_defender_start');
      bot.entity.money = 800;
    }
    return bot.entity.id;
  }

  removeBot(playerId: number): boolean {
    const idx = this.bots.findIndex((b) => b.entity.id === playerId);
    if (idx < 0) return false;
    const bot = this.bots[idx];
    bot.entity.kill(null);
    this.bots.splice(idx, 1);
    this.commands.delete(playerId);
    this.api.eventBus.emit('bot_removed', { playerId });
    return true;
  }

  kickAll(): void {
    for (const b of [...this.bots]) {
      this.removeBot(b.entity.id);
    }
  }

  update(dt: number, snap: RoundSnapshot): void {
    for (const bot of this.bots) {
      const cmd = bot.update(dt, snap);
      this.commands.set(bot.entity.id, cmd);
    }
    this.updateRadio();
  }

  commandFor(playerId: number): ReturnType<typeof emptyCommand> {
    return this.commands.get(playerId) ?? emptyCommand();
  }

  /** Team radio: any enemy sighting is shared with teammates. */
  private updateRadio(): void {
    for (const bot of this.bots) {
      if (bot.lastSeenPos && bot.visibleEnemyIds.length > 0) {
        const key = bot.entity.team;
        const cur = this.radio.get(key);
        if (!cur || bot.lastSeenAt > cur.at) {
          this.radio.set(key, { pos: { ...bot.lastSeenPos }, at: bot.lastSeenAt });
        }
      }
    }
    for (const bot of this.bots) {
      const info = this.radio.get(bot.entity.team);
      if (info && bot.visibleEnemyIds.length === 0) {
        if (bot.lastSeenAt < info.at) {
          bot.lastSeenPos = vec3(info.pos.x, info.pos.y, info.pos.z);
          bot.lastSeenAt = info.at;
        }
      }
    }
  }
}
