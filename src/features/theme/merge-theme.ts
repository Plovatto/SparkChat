import { COLOR_THEMES, type ColorThemeId } from './constants/color-themes';
import { THEME_BASES, type ThemeBaseId } from './constants/theme-bases';
import type { ThemePalette } from './types';
import { getContrastTextColor } from './utils/contrast-text-color';

const MESSAGE_OTHER_BACKGROUND: Record<ThemeBaseId, string> = {
  dark: '#000000a0',
  light: '#ffffffff',
  midnight: '#000000ff',
};

export interface MergedTheme {
  id: string;
  baseId: ThemeBaseId;
  colorId: ColorThemeId;
  colors: ThemePalette;
}

export function mergeTheme(baseId: ThemeBaseId, colorId: ColorThemeId): MergedTheme {
  const base = THEME_BASES[baseId];
  const color = COLOR_THEMES[colorId];
  const messageOtherBg = MESSAGE_OTHER_BACKGROUND[baseId];
  const messageOwnBg = color.primary;

  return {
    id: `${baseId}-${colorId}`,
    baseId,
    colorId,
    colors: {
      background: base.background,
      surface: base.surface,
      surfaceLight: base.surfaceLight,
      text: base.text,
      textSecondary: base.textSecondary,
      border: base.border,
      inputBg: base.inputBg,
      sidebarBg: base.sidebarBg,
      primary: color.primary,
      secondary: color.secondary,
      messageOwn: messageOwnBg,
      messageOwnText: getContrastTextColor(messageOwnBg),
      messageOther: messageOtherBg,
      messageOtherText: getContrastTextColor(messageOtherBg),
      headerGradient: color.headerGradient,
      headerTextColor: color.textColor,
    },
  };
}
