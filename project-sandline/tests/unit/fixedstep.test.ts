import { describe, it, expect } from 'vitest';
import { FixedStepLoop, SIM_HZ } from '../../src/core/FixedStepLoop';

describe('FixedStepLoop', () => {
  it('runs the expected number of ticks for one second of wall time', () => {
    let ticks = 0;
    const loop = new FixedStepLoop({
      step: () => ticks++,
      render: () => undefined,
    });
    // 60 fps * 1 second of 1/60 frames.
    for (let i = 0; i < 60; i++) loop.feed(1 / 60);
    expect(ticks).toBe(SIM_HZ);
  });

  it('accumulates sub-step remainders', () => {
    let ticks = 0;
    const loop = new FixedStepLoop({
      step: () => ticks++,
      render: () => undefined,
    });
    loop.feed(0.5 / SIM_HZ);
    loop.feed(0.5 / SIM_HZ);
    expect(ticks).toBe(1);
  });

  it('caps catch-up steps and drops the backlog', () => {
    let ticks = 0;
    const loop = new FixedStepLoop(
      { step: () => ticks++, render: () => undefined },
      SIM_HZ,
      8,
    );
    loop.feed(5); // way over budget
    expect(ticks).toBe(8);
    expect(loop.droppedSteps).toBeGreaterThan(0);
  });

  it('runSteps executes exactly n steps', () => {
    let ticks = 0;
    const loop = new FixedStepLoop({ step: () => ticks++, render: () => undefined });
    loop.runSteps(100);
    expect(ticks).toBe(100);
  });
});
