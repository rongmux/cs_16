// Mouse look: accumulates pointer deltas into yaw/pitch with sensitivity,
// Y-inversion and pitch clamping (design doc 10.2). Pitch range [-89, 89].

import { clamp } from '../core/math';

const MAX_PITCH = (89 * Math.PI) / 180;

export class MouseLook {
  yaw = 0;
  pitch = 0;
  /** Radians per pixel. */
  sensitivity = 0.0021;
  invertY = false;

  setSensitivity(value: number): void {
    // Menu value 0.2 .. 4.0 -> radians/px.
    this.sensitivity = 0.0021 * value;
  }

  addDelta(dx: number, dy: number): void {
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -MAX_PITCH, MAX_PITCH);
  }

  setAngles(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -MAX_PITCH, MAX_PITCH);
  }
}
