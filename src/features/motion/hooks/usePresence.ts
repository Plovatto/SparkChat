import { useEffect, useRef, useState } from 'react';
import { MOTION_DURATION_MS } from '../constants/motion';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export interface PresenceState {
  isPresent: boolean;
  isExiting: boolean;
}

export function usePresence(isOpen: boolean, exitDurationMs: number = MOTION_DURATION_MS.normal): PresenceState {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isPresent, setIsPresent] = useState(isOpen);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const clearPendingExit = () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    if (isOpen) {
      clearPendingExit();
      setIsPresent(true);
      return;
    }

    if (!isPresent) {
      return;
    }

    clearPendingExit();
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setIsPresent(false);
    }, prefersReducedMotion ? 0 : exitDurationMs);

    return clearPendingExit;
  }, [isOpen, isPresent, exitDurationMs, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { isPresent, isExiting: isPresent && !isOpen };
}
