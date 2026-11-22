import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export function useCycle(length: number, intervalMs: number, active: boolean): { index: number; reduced: boolean } {
  const [index, setIndex] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!active || reduced || length < 2) {
      return;
    }
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % length), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, reduced, length, intervalMs]);

  return { index, reduced };
}
