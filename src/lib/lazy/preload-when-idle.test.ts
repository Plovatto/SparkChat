import { afterEach, describe, expect, it, vi } from 'vitest';
import { preloadWhenIdle } from './preload-when-idle';

function fakeWindow() {
  const callbacks: Array<() => void> = [];
  const target = {
    requestIdleCallback: vi.fn((callback: () => void) => {
      callbacks.push(callback);
      return callbacks.length;
    }),
    cancelIdleCallback: vi.fn(),
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
  };
  const flush = async () => {
    const callback = callbacks.shift();
    callback?.();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { target: target as unknown as Window, raw: target, flush };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('preloadWhenIdle', () => {
  it('runs each preload one at a time in idle periods', async () => {
    const { target, raw, flush } = fakeWindow();
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());

    preloadWhenIdle([first, second], target);
    expect(first).not.toHaveBeenCalled();

    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    await flush();
    expect(second).toHaveBeenCalledTimes(1);
    expect(raw.requestIdleCallback).toHaveBeenCalledTimes(2);
  });

  it('keeps going when a preload fails', async () => {
    const { target, flush } = fakeWindow();
    const failing = vi.fn(() => Promise.reject(new Error('offline')));
    const next = vi.fn(() => Promise.resolve());

    preloadWhenIdle([failing, next], target);
    await flush();
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('stops scheduling after cancel', async () => {
    const { target, raw, flush } = fakeWindow();
    const preload = vi.fn(() => Promise.resolve());

    const cancel = preloadWhenIdle([preload], target);
    cancel();
    await flush();

    expect(raw.cancelIdleCallback).toHaveBeenCalledWith(1);
    expect(preload).not.toHaveBeenCalled();
  });

  it('falls back to a timer without requestIdleCallback', () => {
    vi.useFakeTimers();
    const preload = vi.fn(() => Promise.resolve());

    preloadWhenIdle([preload], { setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms), clearTimeout: (handle: number) => clearTimeout(handle) } as unknown as Window);
    expect(preload).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(preload).toHaveBeenCalledTimes(1);
  });
});
