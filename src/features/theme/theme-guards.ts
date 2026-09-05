import { COLOR_THEMES, type ColorThemeId } from './constants/color-themes';
import { THEME_BASES, type ThemeBaseId } from './constants/theme-bases';

export const BASE_STORAGE_KEY = 'chatBaseTheme';
export const COLOR_STORAGE_KEY = 'chatColorTheme';

export function isThemeBaseId(value: string): value is ThemeBaseId {
  return value in THEME_BASES;
}

export function isColorThemeId(value: string): value is ColorThemeId {
  return value in COLOR_THEMES;
}

export function hasStoredThemePreference(): boolean {
  return localStorage.getItem(BASE_STORAGE_KEY) !== null || localStorage.getItem(COLOR_STORAGE_KEY) !== null;
}
