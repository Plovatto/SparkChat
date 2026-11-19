export type PresenceStage = 'entering' | 'open' | 'exiting' | 'closed';

export interface PresenceTimers {
  set: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (timer: ReturnType<typeof setTimeout>) => void;
}

const browserTimers: PresenceTimers = {
  set: (handler, ms) => setTimeout(handler, ms),
  clear: (timer) => clearTimeout(timer),
};

export class Presence {
  private stage: PresenceStage;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    open: boolean,
    private readonly enterMs: number,
    private readonly exitMs: number,
    private readonly onChange: (stage: PresenceStage) => void,
    private readonly timers: PresenceTimers = browserTimers,
  ) {
    this.stage = open ? 'open' : 'closed';
  }

  get current(): PresenceStage {
    return this.stage;
  }

  setOpen(open: boolean, reducedMotion = false): void {
    const target = open ? 'open' : 'closed';
    if (this.stage === target || (open && this.stage === 'entering') || (!open && this.stage === 'exiting')) {
      return;
    }
    this.cancel();
    const duration = open ? this.enterMs : this.exitMs;
    if (reducedMotion || duration <= 0) {
      this.go(target);
      return;
    }
    this.go(open ? 'entering' : 'exiting');
    this.timer = this.timers.set(() => {
      this.timer = null;
      this.go(target);
    }, duration);
  }

  dispose(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }

  private go(stage: PresenceStage): void {
    this.stage = stage;
    this.onChange(stage);
  }
}

export function isMounted(stage: PresenceStage): boolean {
  return stage !== 'closed';
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
