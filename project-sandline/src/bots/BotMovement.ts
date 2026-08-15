// Bot movement: waypoint path following with LOS smoothing, stuck detection,
// strafing in combat, teammate avoidance, crouch requests (design doc 86).

import { Vec3, vec3, distXZ, normalize } from '../core/math';
import { Bot } from './Bot';

const NODE_REACH = 1.1;
const STUCK_DIST = 0.3;
const STUCK_COUNT = 3;

export class BotMovement {
  forward = 0;
  right = 0;
  run = true;
  crouchRequest = false;
  movingDir: { x: number; z: number } | null = null;

  private path: Vec3[] = [];
  private pathIndex = 0;
  private targetKey = '';
  private stuckTicks = 0;
  private stuckAcc = 0;
  private repathAcc = 0;

  constructor(private bot: Bot) {}

  private repath(): void {
    const bot = this.bot;
    const target = bot.movingTo;
    if (!target) return;
    const res = bot.api.navGraph.findPath(bot.pos, target);
    this.path = res.found ? bot.api.navGraph.smoothPath(res.path, bot.api.collision) : [];
    this.pathIndex = 0;
    this.stuckTicks = 0;
    this.targetKey = `${target.x.toFixed(1)}:${target.z.toFixed(1)}`;
  }

  update(dt: number): void {
    const bot = this.bot;
    this.forward = 0;
    this.right = 0;
    this.crouchRequest = false;
    this.movingDir = null;

    // Target selection: combat override first, then objective.
    const combatTarget = bot.combat.movementTarget;
    const objectiveTarget = bot.objective.target;
    const target = combatTarget ?? objectiveTarget;
    if (!target) return;

    if (bot.movingTo === null) {
      bot.movingTo = vec3(target.x, target.y, target.z);
    } else if (distXZ(bot.movingTo, target) > 2.5) {
      bot.movingTo = vec3(target.x, target.y, target.z);
    }
    const key = `${bot.movingTo.x.toFixed(1)}:${bot.movingTo.z.toFixed(1)}`;
    if (key !== this.targetKey) this.repath();

    this.repathAcc += dt;
    if (this.repathAcc > 2.5) {
      // Periodic repath to handle dynamic situations.
      this.repathAcc = 0;
      this.repath();
    }

    // Stuck detection.
    this.stuckAcc += dt;
    if (this.stuckAcc > 0.45) {
      this.stuckAcc = 0;
      const moved = distXZ(bot.pos, this.lastCheckPos ?? bot.pos);
      if (this.lastCheckPos && moved < STUCK_DIST && (combatTarget || objectiveTarget)) {
        this.stuckTicks++;
        if (this.stuckTicks >= STUCK_COUNT) {
          // Jitter the target to escape local minima, then repath.
          const jx = bot.rng.range(-2, 2);
          const jz = bot.rng.range(-2, 2);
          bot.movingTo = vec3(bot.movingTo.x + jx, bot.movingTo.y, bot.movingTo.z + jz);
          this.repath();
          this.stuckTicks = 0;
        }
      } else {
        this.stuckTicks = 0;
      }
      this.lastCheckPos = vec3(bot.pos.x, bot.pos.y, bot.pos.z);
    }

    // Follow path.
    let dirX: number, dirZ: number;
    if (this.path.length > 0 && this.pathIndex < this.path.length) {
      while (this.pathIndex < this.path.length - 1 && distXZ(bot.pos, this.path[this.pathIndex]) < NODE_REACH) {
        this.pathIndex++;
      }
      const node = this.path[this.pathIndex];
      const dx = node.x - bot.pos.x;
      const dz = node.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        dirX = 0;
        dirZ = 0;
      } else {
        dirX = dx / d;
        dirZ = dz / d;
      }
    } else {
      // Direct steering to the target (last meters or combat).
      const dx = bot.movingTo.x - bot.pos.x;
      const dz = bot.movingTo.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) {
        dirX = 0;
        dirZ = 0;
        if (this.path.length > 0) this.path = [];
      } else {
        dirX = dx / d;
        dirZ = dz / d;
      }
    }

    // Teammate avoidance: slow down when someone is directly ahead.
    let slow = 1;
    for (const mate of bot.api.players()) {
      if (mate.id === bot.entity.id || !mate.alive || mate.team !== bot.entity.team) continue;
      const d = distXZ(mate.pos, bot.pos);
      if (d < 1.3) {
        const toMate = normalize(vec3(mate.pos.x - bot.pos.x, 0, mate.pos.z - bot.pos.z));
        if (dirX * toMate.x + dirZ * toMate.z > 0.7) slow = 0.25;
      }
    }

    if (dirX === 0 && dirZ === 0) return;
    this.movingDir = { x: dirX, z: dirZ };

    // Convert world-space direction into input relative to current yaw.
    const yaw = bot.entity.yaw;
    const fx = Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = Math.sin(yaw);
    this.forward = (dirX * fx + dirZ * fz) * slow;
    this.right = dirX * rx + dirZ * rz;
    this.run = true;
  }

  private lastCheckPos: Vec3 | null = null;
}
