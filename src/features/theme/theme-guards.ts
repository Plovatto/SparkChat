import { COLOR_THEMES, type ColorThemeId } from './constants/color-themes';
import { THEME_BASES, type ThemeBaseId } from './constants/theme-bases';

export function isThemeBaseId(value: string): value is ThemeBaseId {
  return value in THEME_BASES;
}

export function isColorThemeId(value: string): value is ColorThemeId {
  return value in COLOR_THEMES;
}
