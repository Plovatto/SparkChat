import { describe, expect, it } from 'vitest';
import { longTaskPressure, watchCpuPressure, worstPressure, type PressureDeps } from './cpu-pressure';

describe('longTaskPressure', () => {
  it('rates how much of the last seconds the main thread was blocked', () => {
    expect(longTaskPressure([], 10_000)).toBe('nominal');
    expect(longTaskPressure([[7_000, 1_200]], 10_000)).toBe('fair');
    expect(longTaskPressure([[6_500, 1_000], [8_000, 1_500]], 10_000)).toBe('serious');
  });

  it('only counts the part of a task inside the window', () => {
    expect(longTaskPressure([[1_000, 5_500]], 10_000)).toBe('nominal');
  });
});

describe('worstPressure', () => {
  it('keeps the worse of two readings', () => {
    expect(worstPressure('fair', 'serious')).toBe('serious');
    expect(worstPressure('critical', 'nominal')).toBe('critical');
    expect(worstPressure(null, 'fair')).toBe('fair');
    expect(worstPressure(null, null)).toBeNull();
  });
});

describe('watchCpuPressure', () => {
  it('combines system pressure with main thread long tasks and stops both observers', () => {
    let pressureCallback: ((records: Array<{ state: string }>) => void) | null = null;
    let taskCallback: ((list: { getEntries: () => Array<{ startTime: number; duration: number }> }) => void) | null = null;
    const disconnected: string[] = [];
    let now = 10_000;
    const deps: PressureDeps = {
      PressureObserver: class {
        constructor(callback: (records: Array<{ state: string }>) => void) {
          pressureCallback = callback;
        }
        observe() {
          return Promise.resolve();
        }
        disconnect() {
          disconnected.push('pressure');
        }
      },
      PerformanceObserver: class {
        constructor(callback: (list: { getEntries: () => Array<{ startTime: number; duration: number }> }) => void) {
          taskCallback = callback;
        }
        observe() {
          return undefined;
        }
        disconnect() {
          disconnected.push('tasks');
        }
      },
      now: () => now,
    };
    const watch = watchCpuPressure(deps);
    expect(watch.current()).toBe('nominal');
    pressureCallback!([{ state: 'fair' }]);
    expect(watch.current()).toBe('fair');
    taskCallback!({ getEntries: () => [{ startTime: 7_000, duration: 2_500 }] });
    expect(watch.current()).toBe('serious');
    now = 20_000;
    expect(watch.current()).toBe('fair');
    watch.stop();
    expect(disconnected.sort()).toEqual(['pressure', 'tasks']);
  });

  it('reports nothing where neither observer exists', () => {
    expect(watchCpuPressure({ now: () => 0 }).current()).toBeNull();
  });
});
