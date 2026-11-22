import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_DELAY_MS, useLongPress } from './useLongPress';

function touch(x = 10, y = 10): PointerEvent<HTMLElement> {
  return { pointerType: 'touch', button: 0, clientX: x, clientY: y } as PointerEvent<HTMLElement>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function firedLongPress() {
  const onLongPress = vi.fn();
  const hook = renderHook(() => useLongPress({ onLongPress }));
  act(() => {
    hook.result.current.handlers.onPointerDown(touch());
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS + 10);
  });
  expect(onLongPress).toHaveBeenCalledTimes(1);
  return hook;
}

describe('useLongPress', () => {
  it('swallows the click that comes right after releasing a long press', () => {
    const { result } = firedLongPress();
    act(() => result.current.handlers.onPointerUp());

    expect(result.current.consumeLongPress()).toBe(true);
    expect(result.current.consumeLongPress()).toBe(false);
  });

  it('does not swallow a later tap when the release click never arrived', () => {
    const { result } = firedLongPress();
    act(() => result.current.handlers.onPointerUp());
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.consumeLongPress()).toBe(false);
  });

  it('cancels when the finger moves', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress }));
    act(() => {
      result.current.handlers.onPointerDown(touch(10, 10));
      result.current.handlers.onPointerMove(touch(40, 10));
      vi.advanceTimersByTime(LONG_PRESS_DELAY_MS + 10);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.consumeLongPress()).toBe(false);
  });
});
