// Bot perception: vision cone + LOS raycasts + hearing events + teammate
// reports. A bot never reads enemy.position directly - only through this
// module (design doc 19.2, 87).

import { vec3, dot, normalize, distXZ } from '../core/math';
import { Bot } from './Bot';

const MAX_VISION_RANGE = 45;
const FOV_DOT = Math.cos((110 * Math.PI) / 360); // ~110 degree total cone
const HEAR_RANGE = 40;

export class BotPerception {
  private visionAcc = 0;

  constructor(private bot: Bot) {
    const api = bot.api;
    api.eventBus.on('weapon_fired', (e) => {
      this.hear(e.pos, e.loudness, e.shooterId);
    });
    api.eventBus.on('grenade_exploded', (e) => {
      this.hear(e.pos, 1.2, -1);
    });
    api.eventBus.on('footstep', (e) => {
      this.hear(e.pos, 0.4 * e.loudness, e.playerId);
    });
  }

  private hear(pos: { x: number; y: number; z: number }, loudness: number, sourceId: number): void {
    const bot = this.bot;
    if (!bot.alive) return;
    if (sourceId === bot.entity.id) return;
    const src = bot.api.playerById(sourceId);
    if (src && src.team === bot.entity.team) return; // own team's noise ignored for tracking
    const d = distXZ(bot.pos, pos);
    const range = HEAR_RANGE * loudness * bot.difficulty.hearingScale;
    if (d > range) return;
    if (bot.visibleEnemyIds.length > 0) return;
    bot.lastHeardPos = vec3(pos.x, pos.y, pos.z);
    bot.lastHeardAt = bot.api.time();
  }

  update(dt: number): void {
    const bot = this.bot;
    bot.visibleEnemyIds = [];
    this.visionAcc += dt;
    const interval = 1 / Math.max(1, bot.difficulty.visionHz);
    if (this.visionAcc < interval) return;
    this.visionAcc = 0;

    const eye = bot.entity.eyePos();
    const forward = bot.entity.viewForward();
    for (const enemy of bot.api.enemiesOf(bot.entity.team)) {
      if (!enemy.alive) continue;
      const to = vec3(enemy.pos.x - eye.x, enemy.pos.y + 1.2 - eye.y, enemy.pos.z - eye.z);
      const dist = Math.hypot(to.x, to.y, to.z);
      if (dist > MAX_VISION_RANGE) continue;
      const dir = normalize(to);
      if (dot(forward, dir) < FOV_DOT) continue;
      // LOS raycast from eye to the enemy's chest.
      const target = vec3(enemy.pos.x, enemy.pos.y + 1.2, enemy.pos.z);
      if (!bot.api.collision.segmentClear(eye, target)) continue;
      bot.visibleEnemyIds.push(enemy.id);
      bot.lastSeenPos = vec3(enemy.pos.x, enemy.pos.y, enemy.pos.z);
      bot.lastSeenAt = bot.api.time();
    }
  }
}
