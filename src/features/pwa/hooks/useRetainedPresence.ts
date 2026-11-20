import { useRef } from 'react';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';

export const PWA_CARD_EXIT_MS = MOTION_DURATION_MS.normal;
export const PWA_TOAST_EXIT_MS = MOTION_DURATION_MS.fast;

export function resolveRetainedValue<T>(value: T | null, retained: T | null): T | null {
  return value ?? retained;
}

export interface RetainedPresence<T> {
  value: T | null;
  isPresent: boolean;
  isExiting: boolean;
}

export function useRetainedPresence<T>(value: T | null, exitDurationMs: number): RetainedPresence<T> {
  const { isPresent, isExiting } = usePresence(value !== null, exitDurationMs);
  const retainedRef = useRef<T | null>(value);
  if (value !== null) {
    retainedRef.current = value;
  }
  const shown = isPresent ? resolveRetainedValue(value, retainedRef.current) : null;
  return { value: shown, isPresent: isPresent && shown !== null, isExiting };
}
