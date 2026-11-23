interface IdleWindow {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
}

export const FIRST_PAINT_IDLE_TIMEOUT_MS = 1000;

export function afterFirstPaint(target: Window, run: () => void): void {
  const idle = target as unknown as IdleWindow;
  if (typeof idle.requestIdleCallback === 'function') {
    idle.requestIdleCallback(run, { timeout: FIRST_PAINT_IDLE_TIMEOUT_MS });
    return;
  }
  target.requestAnimationFrame(() => {
    target.setTimeout(run, 0);
  });
}
