import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSplashPresence } from './useSplashPresence';

const OPTIONS = { minVisibleMs: 900, exitMs: 600 };

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useSplashPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays unmounted when it starts inactive', () => {
    const { result } = renderHook(() => useSplashPresence(false, OPTIONS));
    expect(result.current).toEqual({ mounted: false, leaving: false });
  });

  it('keeps the splash for the minimum time, then plays the exit and unmounts', () => {
    const { result, rerender } = renderHook(({ active }) => useSplashPresence(active, OPTIONS), {
      initialProps: { active: true },
    });
    expect(result.current).toEqual({ mounted: true, leaving: false });

    advance(200);
    rerender({ active: false });
    expect(result.current).toEqual({ mounted: true, leaving: false });

    advance(699);
    expect(result.current.leaving).toBe(false);

    advance(1);
    expect(result.current).toEqual({ mounted: true, leaving: true });

    advance(600);
    expect(result.current).toEqual({ mounted: false, leaving: false });
  });

  it('leaves right away once the minimum time already passed', () => {
    const { result, rerender } = renderHook(({ active }) => useSplashPresence(active, OPTIONS), {
      initialProps: { active: true },
    });
    advance(2000);
    rerender({ active: false });
    advance(0);
    expect(result.current.leaving).toBe(true);
  });

  it('comes back when it is activated again during the exit', () => {
    const { result, rerender } = renderHook(({ active }) => useSplashPresence(active, OPTIONS), {
      initialProps: { active: true },
    });
    advance(1000);
    rerender({ active: false });
    advance(0);
    expect(result.current.leaving).toBe(true);

    rerender({ active: true });
    expect(result.current).toEqual({ mounted: true, leaving: false });

    advance(5000);
    expect(result.current).toEqual({ mounted: true, leaving: false });
  });

  it('mounts again when activated after it was gone', () => {
    const { result, rerender } = renderHook(({ active }) => useSplashPresence(active, OPTIONS), {
      initialProps: { active: false },
    });
    rerender({ active: true });
    expect(result.current).toEqual({ mounted: true, leaving: false });
  });
});
