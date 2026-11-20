export interface PlayableLike {
  srcObject: MediaProvider | null;
  play: () => Promise<void>;
}

export interface InteractionTarget {
  addEventListener: (type: string, listener: () => void, options?: AddEventListenerOptions | boolean) => void;
  removeEventListener: (type: string, listener: () => void, options?: EventListenerOptions | boolean) => void;
}

const INTERACTIONS = ['pointerdown', 'keydown'] as const;

export function hasTracks(element: PlayableLike): boolean {
  const source = element.srcObject as MediaStream | null;
  return source !== null && typeof source.getTracks === 'function' && source.getTracks().length > 0;
}

function isBlocked(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'NotAllowedError';
}

export class AutoplayRetry {
  private readonly blocked = new Set<PlayableLike>();
  private armed = false;
  private readonly retry = () => {
    this.disarm();
    const pending = Array.from(this.blocked);
    this.blocked.clear();
    for (const element of pending) {
      this.play(element);
    }
  };

  constructor(private readonly target: InteractionTarget | null = typeof document === 'undefined' ? null : document) {}

  play(element: PlayableLike | null): void {
    if (!element || !hasTracks(element)) {
      return;
    }
    element.play().then(
      () => {
        this.blocked.delete(element);
      },
      (error: unknown) => {
        if (isBlocked(error)) {
          this.blocked.add(element);
          this.arm();
        }
      },
    );
  }

  forget(element: PlayableLike | null): void {
    if (element) {
      this.blocked.delete(element);
    }
    if (this.blocked.size === 0) {
      this.disarm();
    }
  }

  get pending(): number {
    return this.blocked.size;
  }

  dispose(): void {
    this.blocked.clear();
    this.disarm();
  }

  private arm(): void {
    if (this.armed || !this.target) {
      return;
    }
    this.armed = true;
    for (const type of INTERACTIONS) {
      this.target.addEventListener(type, this.retry, { capture: true });
    }
  }

  private disarm(): void {
    if (!this.armed || !this.target) {
      return;
    }
    this.armed = false;
    for (const type of INTERACTIONS) {
      this.target.removeEventListener(type, this.retry, { capture: true });
    }
  }
}

export const autoplay = new AutoplayRetry();
