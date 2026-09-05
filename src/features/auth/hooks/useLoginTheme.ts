import { useCallback, useEffect, useState } from 'react';
import { buildTheme, mix, type ThemeTokens } from '@features/theme';
import { getItem, setItem } from '@lib/storage';

const DARK_MODE_KEY = 'sparkchat:login-dark-mode';
const WHITE = '#ffffff';

export interface LoginThemeControls {
  darkMode: boolean;
  theme: ThemeTokens;
  toggle: () => void;
}

export function useLoginTheme(): LoginThemeControls {
  const [darkMode, setDarkMode] = useState<boolean>(() => getItem<boolean>(DARK_MODE_KEY) ?? true);

  useEffect(() => {
    setItem(DARK_MODE_KEY, darkMode);
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
