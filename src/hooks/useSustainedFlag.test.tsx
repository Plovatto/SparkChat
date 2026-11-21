import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSustainedFlag } from './useSustainedFlag';

describe('useSustainedFlag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays false while the flag has not been active for the whole delay', () => {
    const { result } = renderHook(() => useSustainedFlag(true, 1000));
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(false);
  });

  it('turns true once the flag stays active for the delay', () => {
    const { result } = renderHook(() => useSustainedFlag(true, 1000));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(true);
  });

  it('resets right away when the flag goes inactive and restarts the delay', () => {
    const { result, rerender } = renderHook(({ active }) => useSustainedFlag(active, 1000), { initialProps: { active: true } });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender({ active: false });
    expect(result.current).toBe(false);
    rerender({ active: true });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(false);
  });

  it('never turns true when a short blip ends before the delay', () => {
    const { result, rerender } = renderHook(({ active }) => useSustainedFlag(active, 1000), { initialProps: { active: true } });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(false);
  });
});
