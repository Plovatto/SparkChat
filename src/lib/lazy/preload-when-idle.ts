type Preload = () => Promise<unknown>;

interface IdleWindow {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

const IDLE_TIMEOUT_MS = 4000;
const FALLBACK_DELAY_MS = 1500;

export function preloadWhenIdle(preloads: readonly Preload[], target: Window = window): () => void {
  const idle = target as unknown as IdleWindow;
  let cancelled = false;
  let handle: number | null = null;
  let usesIdle = false;
  let index = 0;

  const schedule = () => {
    if (cancelled || index >= preloads.length) {
      return;
    }
    if (typeof idle.requestIdleCallback === 'function') {
      usesIdle = true;
      handle = idle.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    } else {
      handle = target.setTimeout(run, FALLBACK_DELAY_MS);
    }
  };

  function run() {
    handle = null;
    const preload = preloads[index];
    index += 1;
    if (cancelled || !preload) {
      return;
    }
    preload().then(schedule, schedule);
  }

  schedule();

  return () => {
    cancelled = true;
    if (handle === null) {
      return;
    }
    if (usesIdle) {
      idle.cancelIdleCallback?.(handle);
    } else {
      target.clearTimeout(handle);
    }
  };
}
