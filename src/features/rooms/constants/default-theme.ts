import { mergeTheme, type ThemePalette } from '@features/theme';

export type RoomThemePalette = ThemePalette;

export const DEFAULT_ROOM_THEME: RoomThemePalette = mergeTheme('dark', 'standard').colors;
