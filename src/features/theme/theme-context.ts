import { createContext, use } from 'react';
import type { ColorThemeId } from './constants/color-themes';
import type { ThemeBaseId } from './constants/theme-bases';
import type { ThemePalette } from './types';

export interface ThemeContextValue {
  theme: ThemePalette;
  baseTheme: ThemeBaseId;
  colorTheme: ColorThemeId;
  changeBaseTheme: (baseId: ThemeBaseId) => void;
  changeColorTheme: (colorId: ColorThemeId) => void;
  changeTheme: (themeId: string) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
