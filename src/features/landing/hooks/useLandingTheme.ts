import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { buildTheme } from '@features/theme/build-theme';
import { applyThemeCssVars, themeTokensToCssVars } from '@features/theme/theme-css-vars';
import { LANDING_WALLPAPER_ID_LIST } from '../constants/wallpapers';
import { DEFAULT_LANDING_THEME, readLandingTheme, writeLandingTheme, type LandingThemeChoice } from '../lib/landing-theme-storage';
import { REDUCED_MOTION_QUERY } from '@constants/media-queries';

const THEME_TRANSITION_CLASS = 'sc-theme-transition';
const THEME_TRANSITION_MS = 420;
const REVEAL_DURATION_MS = 700;
const REVEAL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

interface Point {
  x: number;
  y: number;
}

export interface LandingThemeControls {
  theme: LandingThemeChoice;
  select: (change: Partial<LandingThemeChoice>) => void;
}

function runThemeTransition(): void {
  const root = document.documentElement;
  root.classList.add(THEME_TRANSITION_CLASS);
  window.setTimeout(() => root.classList.remove(THEME_TRANSITION_CLASS), THEME_TRANSITION_MS);
}

function revealFrom(origin: Point | null, apply: () => void): void {
  if (typeof document.startViewTransition !== 'function' || window.matchMedia(REDUCED_MOTION_QUERY).matches) {
    runThemeTransition();
    apply();
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = document.startViewTransition(() => flushSync(apply));

  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_DURATION_MS, easing: REVEAL_EASING, pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => undefined);
}

export function useLandingTheme(): LandingThemeControls {
  const [theme, setTheme] = useState<LandingThemeChoice>(DEFAULT_LANDING_THEME);
  const pointerRef = useRef<Point | null>(null);

  useEffect(() => {
    const stored = readLandingTheme(window.localStorage, LANDING_WALLPAPER_ID_LIST);
    const initial = stored ?? DEFAULT_LANDING_THEME;
    applyThemeCssVars(buildTheme(initial.base, initial.color).tokens);
    if (stored) {
      setTheme(stored);
    }

    const rememberPointer = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener('pointerdown', rememberPointer, { capture: true, passive: true });
    return () => document.removeEventListener('pointerdown', rememberPointer, { capture: true });
  }, []);

  const select = useCallback(
    (change: Partial<LandingThemeChoice>) => {
      const next = { ...theme, ...change };
      const tokens = buildTheme(next.base, next.color).tokens;
      writeLandingTheme(window.localStorage, { ...next, kind: tokens.kind, vars: themeTokensToCssVars(tokens) });

      if (next.base === theme.base && next.color === theme.color) {
        setTheme(next);
        return;
      }

      revealFrom(pointerRef.current, () => {
        applyThemeCssVars(tokens);
        setTheme(next);
      });
    },
    [theme],
  );

  return { theme, select };
}
