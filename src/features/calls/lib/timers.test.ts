import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelInterval, cancelTimeout, sleep, takeTimed } from './timers';

describe('call timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels a pending timeout and returns null', () => {
    const fn = vi.fn();
    const handle: ReturnType<typeof setTimeout> = setTimeout(() => fn(), 100);
    expect(cancelTimeout(handle)).toBeNull();
    expect(cancelTimeout(null)).toBeNull();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancels a running interval and returns null', () => {
    const fn = vi.fn();
    const handle: ReturnType<typeof setInterval> = setInterval(() => fn(), 50);
    vi.advanceTimersByTime(60);
    expect(cancelInterval(handle)).toBeNull();
    expect(cancelInterval(null)).toBeNull();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('sleep resolves after the delay', async () => {
    const done = vi.fn();
    void sleep(100).then(done);
    await vi.advanceTimersByTimeAsync(99);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it('takeTimed clears the entry timer and removes it from the map', () => {
    const fired = vi.fn();
    const entries = new Map<string, { timer: ReturnType<typeof setTimeout>; value: number }>([['a', { timer: setTimeout(() => fired(), 100), value: 1 }]]);
    expect(takeTimed(entries, 'a')?.value).toBe(1);
    expect(entries.has('a')).toBe(false);
    expect(takeTimed(entries, 'a')).toBeUndefined();
    vi.advanceTimersByTime(200);
    expect(fired).not.toHaveBeenCalled();
  });
});
