// Bot combat: target selection, burst fire control, reload/switch decisions,
// strafing, crouching and grenade usage (design doc 19.5).

import { Vec3, vec3, distXZ } from '../core/math';
import { Bot } from './Bot';

const LAST_SEEN_MEMORY = 8; // seconds
const TRACKING_TOLERANCE = 1.5; // still "tracking" after losing sight

export class BotCombat {
  engaged = false;
  /** Movement override while fighting (strafe/advance/retreat point). */
  movementTarget: Vec3 | null = null;

  private acc = 0;
  private fireUntil = 0;
  private pauseUntil = 0;
  private strafeDir = 1;
  private strafeUntil = 0;
  private crouchUntil = 0;
  private lastGrenadeAt = -999;
  private lostSightAt = -1;

  constructor(private bot: Bot) {}

  update(dt: number): void {
    const bot = this.bot;
    this.acc += dt;
    const interval = 1 / Math.max(1, bot.difficulty.combatHz);
    if (this.acc < interval) return;
    this.acc = 0;
    const now = bot.api.time();

    // ---- Target selection ----
    const visible = bot.visibleEnemyIds;
    if (visible.length > 0) {
      let best: number | null = null;
      let bestD = Infinity;
      for (const id of visible) {
        const e = bot.api.playerById(id);
        if (!e || !e.alive) continue;
        const d = distXZ(e.pos, bot.pos);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      bot.targetEnemyId = best;
      bot.lastSeenPos = best !== null ? vec3(bot.api.playerById(best)!.pos.x, 0, bot.api.playerById(best)!.pos.z) : bot.lastSeenPos;
      bot.lastSeenAt = now;
      this.lostSightAt = -1;
    } else if (bot.targetEnemyId !== null) {
      if (this.lostSightAt < 0) this.lostSightAt = now;
      if (now - this.lostSightAt > LAST_SEEN_MEMORY) {
        bot.targetEnemyId = null;
        bot.lastSeenPos = null;
      }
    }

    const target = bot.targetEnemyId !== null ? (bot.api.playerById(bot.targetEnemyId) ?? null) : null;
    const targetVisible = target !== null && target.alive && visible.includes(target.id);
    this.engaged = target !== null && target.alive && bot.lastSeenPos !== null;

    // ---- Movement behavior while engaged ----
    if (this.engaged && bot.lastSeenPos) {
      const d = distXZ(bot.pos, bot.lastSeenPos);
      const yaw = bot.entity.yaw;
      const rx = Math.cos(yaw);
      const rz = Math.sin(yaw);
      if (now > this.strafeUntil) {
        this.strafeDir = bot.rng.next() < 0.5 ? -1 : 1;
        this.strafeUntil = now + bot.rng.range(0.4, 1.1);
      }
      if (targetVisible) {
        if (d > 20) {
          // Advance on a distant target.
          this.movementTarget = vec3(bot.lastSeenPos.x, 0, bot.lastSeenPos.z);
        } else if (d < 5) {
          // Back off from a very close target.
          this.movementTarget = vec3(
            bot.pos.x - (bot.lastSeenPos.x - bot.pos.x),
            0,
            bot.pos.z - (bot.lastSeenPos.z - bot.pos.z),
          );
        } else {
          // Strafe perpendicular to the target.
          this.movementTarget = vec3(bot.pos.x + rx * this.strafeDir * 5, 0, bot.pos.z + rz * this.strafeDir * 5);
        }
      } else {
        // Investigate last seen position.
        this.movementTarget = vec3(bot.lastSeenPos.x, 0, bot.lastSeenPos.z);
      }
      if (now > this.crouchUntil) {
        bot.wantCrouch = false;
        if (bot.rng.next() < bot.difficulty.crouchChance) {
          bot.wantCrouch = true;
          this.crouchUntil = now + bot.rng.range(0.4, 1.0);
        }
      }
    } else {
      this.movementTarget = null;
      bot.wantCrouch = false;
    }

    // ---- Fire control (bursts) ----
    if (targetVisible) {
      if (now >= this.pauseUntil) {
        this.fireUntil = now + bot.rng.range(bot.difficulty.burstMsMin, bot.difficulty.burstMsMax) / 1000;
        this.pauseUntil = this.fireUntil + bot.rng.range(bot.difficulty.burstPauseMsMin, bot.difficulty.burstPauseMsMax) / 1000;
      }
      bot.fireIntent = now < this.fireUntil;
    } else {
      // Keep tracking a just-lost target briefly.
      bot.fireIntent = this.lostSightAt >= 0 && now - this.lostSightAt < TRACKING_TOLERANCE && now < this.fireUntil;
    }

    // ---- Reload / switch ----
    const weapon = bot.entity.activeWeapon();
    bot.wantReload = false;
    bot.wantSwitchSlot = null;
    if (weapon) {
      if (weapon.mag === 0) {
        if (weapon.reserve > 0) bot.wantReload = true;
        else if (bot.entity.inventory.secondary && bot.entity.activeSlot !== 'secondary') {
          bot.wantSwitchSlot = 'secondary';
        }
      } else if (weapon.mag <= 3 && !targetVisible && weapon.reserve > 0) {
        bot.wantReload = true;
      }
      // Prefer primary at range, secondary up close.
      if (targetVisible && target) {
        const d = distXZ(bot.pos, target.pos);
        if (d < 7 && bot.entity.activeSlot === 'primary') {
          if (bot.entity.inventory.secondary && bot.entity.weapons.get(bot.entity.inventory.secondary)!.mag > 0) {
            bot.wantSwitchSlot = 'secondary';
          }
        } else if (d > 14 && bot.entity.activeSlot === 'secondary' && bot.entity.inventory.primary) {
          const prim = bot.entity.weapons.get(bot.entity.inventory.primary);
          if (prim && prim.mag > 0) bot.wantSwitchSlot = 'primary';
        }
      }
    }

    // ---- Grenades ----
    bot.wantThrowGrenade = false;
    if (targetVisible && target && bot.entity.grenadeCount('grenade_frag') > 0) {
      const d = distXZ(bot.pos, target.pos);
      if (d > 8 && d < 26 && now - this.lastGrenadeAt > 12 && bot.rng.next() < bot.difficulty.grenadeChance) {
        bot.wantThrowGrenade = true;
        this.lastGrenadeAt = now;
      }
    }
  }
}
