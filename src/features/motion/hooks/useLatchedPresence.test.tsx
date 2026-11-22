import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLatchedPresence } from './useLatchedPresence';

describe('useLatchedPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the last value visible while the exit plays and then drops it', () => {
    const initialProps: { value: string | null } = { value: 'Ada is typing' };
    const { result, rerender } = renderHook(({ value }) => useLatchedPresence(value, 150), { initialProps });
    expect(result.current).toEqual({ value: 'Ada is typing', isPresent: true, isExiting: false });

    rerender({ value: null });
    expect(result.current).toEqual({ value: 'Ada is typing', isPresent: true, isExiting: true });

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toEqual({ value: null, isPresent: false, isExiting: false });
  });

  it('shows the newest value and cancels the exit when a value comes back', () => {
    const initialProps: { value: string | false } = { value: 'first' };
    const { result, rerender } = renderHook(({ value }) => useLatchedPresence(value, 150), { initialProps });
    rerender({ value: false });
    act(() => {
      vi.advanceTimersByTime(60);
    });
    rerender({ value: 'second' });
    expect(result.current).toEqual({ value: 'second', isPresent: true, isExiting: false });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.value).toBe('second');
  });

  it('starts hidden when there is no value', () => {
    const { result } = renderHook(() => useLatchedPresence<number>(undefined));
    expect(result.current).toEqual({ value: null, isPresent: false, isExiting: false });
  });
});
