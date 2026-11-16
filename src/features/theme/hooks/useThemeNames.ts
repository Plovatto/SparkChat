import { useTranslation } from 'react-i18next';
import type themes from '@/locales/pt/themes.json';
import type { ColorThemeId } from '../constants/color-themes';
import type { ThemeBaseId } from '../constants/theme-bases';

type WallpaperId = keyof typeof themes.wallpapers;

export interface ThemeNames {
  color: (id: ColorThemeId) => string;
  base: (id: ThemeBaseId) => string;
  wallpaper: (id: string) => string;
}

export function useThemeNames(): ThemeNames {
  const { t } = useTranslation('themes');

  return {
    color: (id) => t(`colors.${id}`),
    base: (id) => t(`bases.${id}`),
    wallpaper: (id) => t(`wallpapers.${id as WallpaperId}`),
  };
}
