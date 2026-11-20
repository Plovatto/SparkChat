import { useEffect, useRef, useState } from 'react';

export const SPLASH_MIN_VISIBLE_MS = 3000;
export const SPLASH_EXIT_MS = 1000;

type SplashPhase = 'visible' | 'leaving' | 'gone';

interface SplashPresenceOptions {
  minVisibleMs?: number;
  exitMs?: number;
}

export interface SplashPresence {
  mounted: boolean;
  leaving: boolean;
}

export function useSplashPresence(active: boolean, options: SplashPresenceOptions = {}): SplashPresence {
  const minVisibleMs = options.minVisibleMs ?? SPLASH_MIN_VISIBLE_MS;
  const exitMs = options.exitMs ?? SPLASH_EXIT_MS;
  const [phase, setPhase] = useState<SplashPhase>(active ? 'visible' : 'gone');
  const shownAtRef = useRef<number | null>(null);

  if (active && phase !== 'visible') {
    setPhase('visible');
  }

  useEffect(() => {
    if (phase === 'visible' && shownAtRef.current === null) {
      shownAtRef.current = Date.now();
    }
    if (phase === 'gone') {
      shownAtRef.current = null;
    }
  }, [phase]);

  useEffect(() => {
    if (active || phase !== 'visible') {
      return;
    }
    const shownAt = shownAtRef.current ?? Date.now();
    const remaining = Math.max(0, minVisibleMs - (Date.now() - shownAt));
    const timer = window.setTimeout(() => setPhase('leaving'), remaining);
    return () => window.clearTimeout(timer);
  }, [active, phase, minVisibleMs]);

  useEffect(() => {
    if (phase !== 'leaving') {
      return;
    }
    const timer = window.setTimeout(() => setPhase('gone'), exitMs);
    return () => window.clearTimeout(timer);
  }, [phase, exitMs]);

  return { mounted: phase !== 'gone', leaving: phase === 'leaving' };
}
