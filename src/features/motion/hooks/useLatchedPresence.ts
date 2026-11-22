import { useState } from 'react';
import { MOTION_DURATION_MS } from '../constants/motion';
import { usePresence } from './usePresence';

export interface LatchedPresence<T> {
  value: T | null;
  isPresent: boolean;
  isExiting: boolean;
}

interface Latch<T> {
  value: T | null;
  resetKey: unknown;
}

function isActiveValue<T>(value: T | null | undefined | false): value is T {
  return value !== null && value !== undefined && value !== false;
}

export function useLatchedPresence<T>(
  current: T | null | undefined | false,
  exitDurationMs: number = MOTION_DURATION_MS.fast,
  resetKey: unknown = null,
): LatchedPresence<T> {
  const isActive = isActiveValue(current);
  const [latch, setLatch] = useState<Latch<T>>({ value: isActive ? current : null, resetKey });
  if (isActive && (!Object.is(current, latch.value) || !Object.is(resetKey, latch.resetKey))) {
    setLatch({ value: current, resetKey });
  }
  const { isPresent, isExiting } = usePresence(isActive, exitDurationMs);
  const canReplay = isPresent && Object.is(resetKey, latch.resetKey);
  const value = isActive ? current : canReplay ? latch.value : null;
  return { value, isPresent: value !== null, isExiting: value !== null && isExiting };
}
