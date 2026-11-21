export const DUCK_LEVEL = 0.12;
export const DUCK_ATTACK_MS = 120;
export const DUCK_HOLD_MS = 700;
export const DUCK_RELEASE_MS = 350;

export function clampDuckLevel(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DUCK_LEVEL;
}

const STEP_MS = 20;

interface DuckTimers {
  setInterval: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (timer: ReturnType<typeof setInterval>) => void;
  setTimeout: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
}

const browserTimers: DuckTimers = {
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (timer) => clearInterval(timer),
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (timer) => clearTimeout(timer),
};

export class Ducker {
  private level = 1;
  private target = 1;
  private step = 0;
  private ramp: ReturnType<typeof setInterval> | null = null;
  private hold: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;
  private speaking = false;

  constructor(
    private readonly onLevel: (level: number) => void,
    private readonly timers: DuckTimers = browserTimers,
  ) {}

  get current(): number {
    return this.level;
  }

  update(enabled: boolean, speaking: boolean, duckLevel: number = DUCK_LEVEL): void {
    const duck = clampDuckLevel(duckLevel);
    const wasDucking = this.enabled && this.speaking;
    this.enabled = enabled;
    this.speaking = speaking;
    const ducking = enabled && speaking;
    if (ducking) {
      this.clearHold();
      if (!wasDucking || this.target !== duck) {
        this.rampTo(duck, DUCK_ATTACK_MS);
      }
      return;
    }
    if (!enabled) {
      this.clearHold();
      this.rampTo(1, DUCK_RELEASE_MS);
      return;
    }
    if (wasDucking && this.hold === null) {
      this.hold = this.timers.setTimeout(() => {
        this.hold = null;
        this.rampTo(1, DUCK_RELEASE_MS);
      }, DUCK_HOLD_MS);
    }
  }

  dispose(): void {
    this.clearHold();
    this.stopRamp();
  }

  private rampTo(target: number, duration: number): void {
    this.target = target;
    this.stopRamp();
    if (this.level === target) {
      return;
    }
    const steps = Math.max(1, Math.round(duration / STEP_MS));
    this.step = (target - this.level) / steps;
    this.ramp = this.timers.setInterval(() => {
      const next = this.level + this.step;
      const done = this.step < 0 ? next <= this.target : next >= this.target;
      this.level = done ? this.target : next;
      this.onLevel(this.level);
      if (done) {
        this.stopRamp();
      }
    }, STEP_MS);
  }

  private stopRamp(): void {
    if (this.ramp !== null) {
      this.timers.clearInterval(this.ramp);
      this.ramp = null;
    }
  }

  private clearHold(): void {
    if (this.hold !== null) {
      this.timers.clearTimeout(this.hold);
      this.hold = null;
    }
  }
}
