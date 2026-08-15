// Bot objective behavior: site assignment, rotation, plant/defuse execution
// and post-plant holds (design doc 89: no advanced tactics in v1).

import { Vec3, vec3, distXZ } from '../core/math';
import { Bot } from './Bot';
import type { RoundSnapshot } from '../rules/RoundManager';

export class BotObjective {
  /** Tactical movement target. */
  target: Vec3 | null = null;
  wantUsePressed = false;
  wantUseHeld = false;
  private acc = 0;
  private pressSent = false;

  constructor(private bot: Bot) {}

  /** Called by BotManager at round start. */
  resetRound(): void {
    this.bot.assignedSite = null;
    this.target = null;
    this.wantUsePressed = false;
    this.wantUseHeld = false;
    this.pressSent = false;
  }

  update(dt: number, snap: RoundSnapshot): void {
    const bot = this.bot;
    this.acc += dt;
    const interval = 1 / Math.max(1, bot.difficulty.tacticalHz);
    if (this.acc < interval) return;
    this.acc = 0;

    if (snap.phase !== 'live') {
      this.target = null;
      return;
    }

    const bomb = bot.api.bomb;
    const ent = bot.entity;

    // ---- Planted bomb behavior ----
    if (bomb.state === 'planted' || bomb.state === 'defusing') {
      if (ent.team === 'defenders') {
        // Rotate to the bomb and defuse when close and clear.
        if (distXZ(ent.pos, bomb.pos) > 3) {
          this.target = vec3(bomb.pos.x, 0, bomb.pos.z);
          this.wantUseHeld = false;
        } else if (bot.visibleEnemyIds.length === 0) {
          this.target = vec3(bomb.pos.x, 0, bomb.pos.z);
          if (!this.pressSent) {
            this.wantUsePressed = true;
            this.pressSent = true;
          } else {
            this.wantUsePressed = false;
          }
          this.wantUseHeld = true;
        } else {
          // Clear threats first: combat movement overrides the objective.
          this.wantUseHeld = false;
        }
      } else {
        // Attackers: hold the planted site.
        const siteId = bomb.site ?? 'A';
        this.holdSite(siteId);
      }
      return;
    }

    // ---- Pre-plant behavior ----
    if (ent.team === 'attackers') {
      if (ent.inventory.hasBomb) {
        // Carrier: pick a site, go plant.
        if (!bot.assignedSite) bot.assignedSite = bot.api.randomSiteId();
        const site = bot.api.enemySites().find((s) => s.id === bot.assignedSite);
        if (!site) return;
        const sitePos = vec3(site.center[0], 0, site.center[1]);
        if (distXZ(ent.pos, sitePos) > site.radius) {
          this.target = sitePos;
          this.wantUseHeld = false;
        } else if (bot.visibleEnemyIds.length === 0) {
          this.target = sitePos;
          if (!this.pressSent) {
            this.wantUsePressed = true;
            this.pressSent = true;
          } else {
            this.wantUsePressed = false;
          }
          this.wantUseHeld = true;
        } else {
          this.wantUseHeld = false;
        }
      } else {
        // Non-carriers support a site (v1: independent random site choice).
        if (!bot.assignedSite) bot.assignedSite = bot.api.randomSiteId();
        this.holdSite(bot.assignedSite);
      }
      return;
    }

    // ---- Defenders: hold a site pre-plant ----
    if (!bot.assignedSite) {
      bot.assignedSite = bot.api.randomSiteId();
    }
    this.holdSite(bot.assignedSite);
  }

  private holdSite(siteId: string): void {
    const bot = this.bot;
    const nodes = bot.api.siteNodes(siteId);
    if (nodes.length === 0) return;
    const idx = Math.abs(bot.entity.id * 7 + siteId.length) % nodes.length;
    const node = nodes[idx];
    this.target = vec3(node.x, 0, node.z);
  }
}
