// Fixed-timestep loop with accumulator and max catch-up steps.
// Per design doc 4.2: game logic never reads requestAnimationFrame deltaTime.

export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;
export const MAX_CATCHUP_STEPS = 8;

export interface FixedStepCallbacks {
  /** Runs once per fixed simulation step. */
  step: (dt: number) => void;
  /** Runs once per rendered frame, receives interpolation alpha in [0,1]. */
  render: (alpha: number) => void;
}

export class FixedStepLoop {
  private accumulator = 0;
  private lastTime: number | null = null;
  private running = false;
  private rafId = 0;
  /** Simulation steps run since start (useful for debug overlay). */
  tickCount = 0;
  droppedSteps = 0;
  paused = false;

  constructor(
    private callbacks: FixedStepCallbacks,
    private simHz = SIM_HZ,
    private maxCatchup = MAX_CATCHUP_STEPS,
  ) {}

  get dt(): number {
    return 1 / this.simHz;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const elapsed = Math.min((now - (this.lastTime ?? now)) / 1000, 0.25);
      this.lastTime = now;
      if (!this.paused) {
        this.feed(elapsed);
      }
      this.callbacks.render(this.paused ? 0 : this.accumulator / this.dt);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Feed real elapsed time into the accumulator and run due steps. */
  feed(elapsedSec: number): number {
    this.accumulator += elapsedSec;
    let steps = 0;
    while (this.accumulator >= this.dt) {
      if (steps >= this.maxCatchup) {
        // Frame budget exceeded (e.g. tab was hidden): drop the backlog.
        this.droppedSteps++;
        this.accumulator = 0;
        break;
      }
      this.callbacks.step(this.dt);
      this.tickCount++;
      steps++;
      this.accumulator -= this.dt;
    }
    return steps;
  }

  /** Run exactly n steps (used by tests and the headless sim). */
  runSteps(n: number): void {
    for (let i = 0; i < n; i++) {
      this.callbacks.step(this.dt);
      this.tickCount++;
    }
  }
}
