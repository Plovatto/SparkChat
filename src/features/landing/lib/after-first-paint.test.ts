import { describe, expect, it, vi } from 'vitest';
import { afterFirstPaint, FIRST_PAINT_IDLE_TIMEOUT_MS } from './after-first-paint';

describe('afterFirstPaint', () => {
  it('waits for an idle period with a timeout', () => {
    const run = vi.fn();
    const scheduled: Array<() => void> = [];
    const requestIdleCallback = vi.fn((callback: () => void) => scheduled.push(callback));

    afterFirstPaint({ requestIdleCallback } as unknown as Window, run);

    expect(run).not.toHaveBeenCalled();
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: FIRST_PAINT_IDLE_TIMEOUT_MS });
    scheduled.shift()?.();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('falls back to the task after the next frame', () => {
    const run = vi.fn();
    const frames: Array<() => void> = [];
    const tasks: Array<() => void> = [];
    const target = {
      requestAnimationFrame: (callback: () => void) => frames.push(callback),
      setTimeout: (callback: () => void) => tasks.push(callback),
    } as unknown as Window;

    afterFirstPaint(target, run);
    expect(run).not.toHaveBeenCalled();
    frames.shift()?.();
    expect(run).not.toHaveBeenCalled();
    tasks.shift()?.();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
