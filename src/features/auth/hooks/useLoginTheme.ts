import { useCallback, useEffect, useRef, useState } from 'react';
import { MOTION_DURATION_MS } from '@features/motion';
import { buildTheme, mix, type ThemeTokens } from '@features/theme';
import { getItem, setItem } from '@lib/storage';

const DARK_MODE_KEY = 'sparkchat:login-dark-mode';
const WHITE = '#ffffff';
const THEME_TRANSITION_CLASS = 'sc-theme-transition';

export interface LoginThemeControls {
  darkMode: boolean;
  theme: ThemeTokens;
  toggle: () => void;
}

export function useLoginTheme(): LoginThemeControls {
  const [darkMode, setDarkMode] = useState<boolean>(() => getItem<boolean>(DARK_MODE_KEY) ?? true);

  const hasAppliedInitialModeRef = useRef(false);

  useEffect(() => {
    setItem(DARK_MODE_KEY, darkMode);

    if (!hasAppliedInitialModeRef.current) {
      hasAppliedInitialModeRef.current = true;
      return;
    }

    const root = document.documentElement;
    root.classList.add(THEME_TRANSITION_CLASS);
    const timeout = window.setTimeout(() => root.classList.remove(THEME_TRANSITION_CLASS), MOTION_DURATION_MS.normal + 60);

    return () => {
      window.clearTimeout(timeout);
      root.classList.remove(THEME_TRANSITION_CLASS);
    };
  }, [darkMode]);

  const toggle = useCallback(() => setDarkMode((previous) => !previous), []);

  const rawTheme = buildTheme(darkMode ? 'dark' : 'light', 'standard').tokens;
  const theme: ThemeTokens = darkMode
    ? rawTheme
    : {
        ...rawTheme,
        surface: mix(rawTheme.surface, WHITE, 0.75),
        surfaceSunken: mix(rawTheme.surfaceSunken, WHITE, 0.75),
        input: mix(rawTheme.input, WHITE, 0.82),
        inputHover: mix(rawTheme.inputHover, WHITE, 0.75),
        inputFocus: mix(rawTheme.inputFocus, WHITE, 0.6),
      };

  return { darkMode, theme, toggle };
}
