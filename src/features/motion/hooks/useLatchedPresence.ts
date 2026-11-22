import { useState } from 'react';
import { MOTION_DURATION_MS } from '../constants/motion';
import { usePresence } from './usePresence';

export interface LatchedPresence<T> {
  value: T | null;
  isPresent: boolean;
  isExiting: boolean;
}

function isActiveValue<T>(value: T | null | undefined | false): value is T {
  return value !== null && value !== undefined && value !== false;
}

export function useLatchedPresence<T>(
  current: T | null | undefined | false,
  exitDurationMs: number = MOTION_DURATION_MS.fast,
): LatchedPresence<T> {
  const isActive = isActiveValue(current);
  const [latched, setLatched] = useState<T | null>(isActive ? current : null);
  if (isActive && !Object.is(current, latched)) {
    setLatched(current);
  }
  const { isPresent, isExiting } = usePresence(isActive, exitDurationMs);
  const value = isActive ? current : isPresent ? latched : null;
  return { value, isPresent: value !== null, isExiting: value !== null && isExiting };
}
