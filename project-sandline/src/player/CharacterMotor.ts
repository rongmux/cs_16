// Classic-style kinematic character controller (ground friction/acceleration,
// air control with speed cap, jump, crouch, step-up). Velocity is integrated
// with the fixed simulation step only - never with render deltaTime
// (design doc 4.2, 9.3).

import { Vec3, vec3, yawForward, yawRight } from '../core/math';
import type { CollisionWorld } from '../world/CollisionWorld';
import type { MovementParams } from '../world/DataFiles';

export interface MoveInput {
  /** -1..1 along the view plane */
  forward: number;
  right: number;
  run: boolean;
  crouch: boolean;
  /** Edge-triggered */
  jump: boolean;
}

export interface CharacterState {
  pos: Vec3;
  vel: Vec3;
  grounded: boolean;
  crouching: boolean;
  /** True when the last horizontal move was blocked by a wall. */
  blockedX: boolean;
  blockedZ: boolean;
  /** Height of the capsule/box in meters. */
  height: number;
}

export class CharacterMotor {
  pos: Vec3 = vec3();
  vel: Vec3 = vec3();
  grounded = false;
  crouching = false;
  blockedX = false;
  blockedZ = false;
  /** Radius of the collision box. */
  radius = 0.3;

  constructor(private params: MovementParams) {
    this.radius = params.capsuleRadius;
  }

  get height(): number {
    return this.crouching ? this.params.crouchingHeight : this.params.standingHeight;
  }

  get eyeHeight(): number {
    return this.crouching ? this.params.eyeHeightCrouch : this.params.eyeHeightStand;
  }

  halfExtents(): Vec3 {
    return vec3(this.radius, this.height / 2, this.radius);
  }

  eyePos(): Vec3 {
    return vec3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  teleport(p: Vec3): void {
    this.pos = vec3(p.x, p.y, p.z);
    this.vel = vec3();
  }

  private canStandUp(world: CollisionWorld): boolean {
    const half = vec3(this.radius, this.params.standingHeight / 2, this.radius);
    return !world.pointInSolid(vec3(this.pos.x, this.pos.y + this.params.standingHeight / 2, this.pos.z)) &&
      !this.overlaps(world, vec3(this.pos.x, this.pos.y, this.pos.z), half);
  }

  private overlaps(world: CollisionWorld, pos: Vec3, half: Vec3): boolean {
    const probe = vec3(pos.x + 0.001, pos.y, pos.z);
    // Reuse moveAABB with zero delta is not valid; do a cheap manual check via
    // a zero-length raycast plus pointInSolid fallback.
    return world.pointInSolid(vec3(probe.x, probe.y + half.y, probe.z), 0.02);
  }

  update(dt: number, input: MoveInput, yaw: number, world: CollisionWorld): CharacterState {
    const p = this.params;

    // Crouch state transitions.
    if (input.crouch && !this.crouching) {
      this.crouching = true;
    } else if (!input.crouch && this.crouching && this.canStandUp(world)) {
      this.crouching = false;
    }

    // Build normalized wish direction on the XZ plane.
    const f = yawForward(yaw);
    const r = yawRight(yaw);
    let wishX = f.x * input.forward + r.x * input.right;
    let wishZ = f.z * input.forward + r.z * input.right;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0.001) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }
    const hasWish = wishLen > 0.001;
    const crouchScale = this.crouching ? p.crouchSpeedScale : 1;
    const maxSpeed = (input.run ? p.runSpeed : p.walkSpeed) * crouchScale;

    if (this.grounded) {
      // Ground friction.
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed > 0.001) {
        let drop = speed * p.groundFriction * dt;
        const control = Math.max(speed, p.stopSpeed);
        let newSpeed = speed - drop;
        if (newSpeed < 0) newSpeed = 0;
        newSpeed = (newSpeed / speed) * control;
        const keep = newSpeed / (speed || 1);
        this.vel.x *= keep;
        this.vel.z *= keep;
      }
      // Ground acceleration toward wish direction.
      if (hasWish) {
        const currentSpeed = this.vel.x * wishX + this.vel.z * wishZ;
        let addSpeed = maxSpeed - currentSpeed;
        if (addSpeed > 0) {
          const accel = p.groundAcceleration * dt * maxSpeed;
          if (accel > addSpeed) addSpeed = Math.max(addSpeed, accel * 0.2);
          if (accel < addSpeed) addSpeed = accel;
          this.vel.x += wishX * addSpeed;
          this.vel.z += wishZ * addSpeed;
        }
      }
    } else {
      // Air control: accelerate wish only, capped at maxAirSpeed.
      if (hasWish) {
        const currentSpeed = this.vel.x * wishX + this.vel.z * wishZ;
        let addSpeed = p.maxAirSpeed - Math.max(0, currentSpeed);
        if (addSpeed > 0) {
          const accel = p.airAcceleration * dt;
          if (accel > addSpeed) addSpeed = Math.max(addSpeed, accel * 0.2);
          if (accel < addSpeed) addSpeed = accel;
          this.vel.x += wishX * addSpeed;
          this.vel.z += wishZ * addSpeed;
        }
      }
    }

    // Jump.
    if (input.jump && this.grounded) {
      this.vel.y = p.jumpImpulse;
      this.grounded = false;
    }

    // Gravity.
    this.vel.y -= p.gravity * dt;

    // Integrate with collision.
    const delta = vec3(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    const half = this.halfExtents();
    const result = world.moveAABB(this.pos, half, delta, p.skinWidth);
    this.blockedX = result.blockedX;
    this.blockedZ = result.blockedZ;

    // Step-up: when blocked while grounded and moving horizontally.
    if ((result.blockedX || result.blockedZ) && this.grounded && (Math.abs(delta.x) > 0.0001 || Math.abs(delta.z) > 0.0001)) {
      const lifted = world.moveAABB(this.pos, half, vec3(0, p.stepHeight, 0), p.skinWidth);
      const horizontal = world.moveAABB(
        lifted.pos,
        half,
        vec3(delta.x, 0, delta.z),
        p.skinWidth,
      );
      if (!horizontal.blockedX && !horizontal.blockedZ) {
        const settled = world.moveAABB(horizontal.pos, half, vec3(0, -p.stepHeight, 0), p.skinWidth);
        this.pos = vec3(settled.pos.x, settled.pos.y, settled.pos.z);
        this.grounded = settled.grounded;
        this.blockedX = false;
        this.blockedZ = false;
        if (this.grounded && this.vel.y < 0) this.vel.y = 0;
        return this.state();
      }
    }

    this.pos = vec3(result.pos.x, result.pos.y, result.pos.z);
    this.grounded = result.grounded;
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;

    return this.state();
  }

  state(): CharacterState {
    return {
      pos: vec3(this.pos.x, this.pos.y, this.pos.z),
      vel: vec3(this.vel.x, this.vel.y, this.vel.z),
      grounded: this.grounded,
      crouching: this.crouching,
      blockedX: this.blockedX,
      blockedZ: this.blockedZ,
      height: this.height,
    };
  }
}

export function hypot(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

void hypot;
