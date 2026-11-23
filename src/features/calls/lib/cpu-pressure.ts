import type { PressureState } from './load-adaptation';

export interface PressureWatch {
  current: () => PressureState | null;
  stop: () => void;
}

export const LONG_TASK_WINDOW_MS = 4_000;
export const LONG_TASK_SERIOUS_RATIO = 0.5;
export const LONG_TASK_FAIR_RATIO = 0.25;

const RANK: Record<PressureState, number> = { nominal: 0, fair: 1, serious: 2, critical: 3 };

export function worstPressure(a: PressureState | null, b: PressureState | null): PressureState | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return RANK[a] >= RANK[b] ? a : b;
}

export function longTaskPressure(tasks: ReadonlyArray<readonly [number, number]>, now: number): PressureState {
  const windowStart = now - LONG_TASK_WINDOW_MS;
  let busy = 0;
  for (const [start, duration] of tasks) {
    const end = start + duration;
    if (end > windowStart) {
      busy += end - Math.max(start, windowStart);
    }
  }
  const ratio = busy / LONG_TASK_WINDOW_MS;
  if (ratio >= LONG_TASK_SERIOUS_RATIO) {
    return 'serious';
  }
  return ratio >= LONG_TASK_FAIR_RATIO ? 'fair' : 'nominal';
}

interface PressureRecordLike {
  state: string;
}

interface PressureObserverLike {
  observe: (source: 'cpu', options?: { sampleInterval?: number }) => Promise<void>;
  disconnect: () => void;
}

type PressureObserverCtor = new (callback: (records: PressureRecordLike[]) => void) => PressureObserverLike;

interface EntryLike {
  startTime: number;
  duration: number;
}

interface PerformanceObserverLike {
  observe: (options: { type: string; buffered?: boolean }) => void;
  disconnect: () => void;
}

type PerformanceObserverCtor = new (callback: (list: { getEntries: () => EntryLike[] }) => void) => PerformanceObserverLike;

export interface PressureDeps {
  PressureObserver?: PressureObserverCtor | undefined;
  PerformanceObserver?: PerformanceObserverCtor | undefined;
  now: () => number;
}

function isPressureState(value: string): value is PressureState {
  return value === 'nominal' || value === 'fair' || value === 'serious' || value === 'critical';
}

function browserDeps(): PressureDeps {
  const scope = typeof globalThis === 'undefined' ? undefined : (globalThis as { PressureObserver?: PressureObserverCtor; PerformanceObserver?: PerformanceObserverCtor });
  return {
    PressureObserver: scope?.PressureObserver,
    PerformanceObserver: scope?.PerformanceObserver,
    now: () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
  };
}

export function watchCpuPressure(deps: PressureDeps = browserDeps()): PressureWatch {
  let system: PressureState | null = null;
  let pressureObserver: PressureObserverLike | null = null;
  let taskObserver: PerformanceObserverLike | null = null;
  let tasks: Array<readonly [number, number]> = [];
  if (deps.PressureObserver) {
    try {
      pressureObserver = new deps.PressureObserver((records) => {
        const state = records.at(-1)?.state;
        if (state && isPressureState(state)) {
          system = state;
        }
      });
      void pressureObserver.observe('cpu', { sampleInterval: 2_000 }).catch(() => {
        system = null;
      });
    } catch {
      pressureObserver = null;
    }
  }
  if (deps.PerformanceObserver) {
    try {
      taskObserver = new deps.PerformanceObserver((list) => {
        const cutoff = deps.now() - LONG_TASK_WINDOW_MS;
        tasks = tasks.filter(([start, duration]) => start + duration > cutoff);
        for (const entry of list.getEntries()) {
          tasks.push([entry.startTime, entry.duration]);
        }
      });
      taskObserver.observe({ type: 'longtask' });
    } catch {
      taskObserver = null;
    }
  }
  return {
    current: () => worstPressure(system, taskObserver ? longTaskPressure(tasks, deps.now()) : null),
    stop: () => {
      pressureObserver?.disconnect();
      taskObserver?.disconnect();
      pressureObserver = null;
      taskObserver = null;
      tasks = [];
    },
  };
}
