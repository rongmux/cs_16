// Bot aim: reaction delay, max angular speed, aim noise, tracking lag,
// recoil compensation. Never snaps instantly to the head (design doc 88).

import { angleDiff, moveTowards, clamp, yawPitchForward } from '../core/math';
import { Bot } from './Bot';

const AIM_ALIGN_YAW = 2.2 * (Math.PI / 180);
const AIM_ALIGN_PITCH = 1.6 * (Math.PI / 180);

export class BotAim {
  onTarget = false;
  private reactionUntil = -1;
  private reactionStartedFor: number | null = null;
  private noisePitch = 0;
  private noiseYaw = 0;

  constructor(private bot: Bot) {}

  /** Aim at the combat target (if any), otherwise align to movement. */
  update(dt: number, engaged: boolean): void {
    const bot = this.bot;
    const ent = bot.entity;
    if (!ent.alive) return;

    const target = bot.api.playerById(bot.targetEnemyId ?? -1);

    // Reaction delay starts when a new target is acquired.
    if (bot.targetEnemyId !== null && this.reactionStartedFor !== bot.targetEnemyId) {
      this.reactionStartedFor = bot.targetEnemyId;
      const d = bot.difficulty;
      this.reactionUntil =
        bot.api.time() + (d.reactionMsMin + bot.rng.next() * (d.reactionMsMax - d.reactionMsMin)) / 1000;
    }
    if (bot.targetEnemyId === null) this.reactionStartedFor = null;

    // Refresh aim noise periodically.
    if (bot.rng.next() < 0.15) {
      const deg = bot.difficulty.aimNoiseDeg;
      this.noisePitch = (bot.rng.next() * 2 - 1) * deg;
      this.noiseYaw = (bot.rng.next() * 2 - 1) * deg;
    }

    const turnSpeed = (bot.difficulty.turnSpeedDegPerSec * Math.PI) / 180;

    if (target && target.alive && engaged) {
      // Aim point: head for skilled bots, chest otherwise.
      const headBias = bot.difficulty.aimTargetPreference === 'head' ? 1.45 : 1.15;
      const aimY = target.pos.y + headBias + (this.noisePitch / 180) * Math.PI * 3;
      const dx = target.pos.x - ent.pos.x;
      const dz = target.pos.z - ent.pos.z;
      const desiredYaw = Math.atan2(dx, -dz);
      const dist = Math.hypot(dx, dz) + 0.01;
      const desiredPitch = Math.atan2(aimY - ent.eyePos().y, dist) + (this.noisePitch * Math.PI) / 180;

      if (bot.api.time() >= this.reactionUntil) {
        ent.yaw += clamp(angleDiff(ent.yaw, desiredYaw + (this.noiseYaw * Math.PI) / 180), -turnSpeed * dt, turnSpeed * dt);
        ent.pitch = moveTowards(ent.pitch, desiredPitch, turnSpeed * 0.7 * dt);
      }
      this.onTarget =
        Math.abs(angleDiff(ent.yaw, desiredYaw)) < AIM_ALIGN_YAW &&
        Math.abs(ent.pitch - desiredPitch) < AIM_ALIGN_PITCH &&
        bot.api.time() >= this.reactionUntil;
    } else {
      this.onTarget = false;
      // Align view with movement direction when traveling.
      const m = bot.movement;
      if (m.movingDir !== null) {
        const desiredYaw = Math.atan2(m.movingDir.x, -m.movingDir.z);
        ent.yaw += clamp(angleDiff(ent.yaw, desiredYaw), -turnSpeed * 2.2 * dt, turnSpeed * 2.2 * dt);
        ent.pitch = moveTowards(ent.pitch, 0, turnSpeed * dt);
      }
    }
    ent.pitch = clamp(ent.pitch, -1.5, 1.5);
    void yawPitchForward;
  }
}
