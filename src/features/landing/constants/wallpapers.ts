import { CHAT_BACKGROUNDS, type ChatBackground } from '@features/theme/constants/chat-backgrounds';

const LANDING_WALLPAPER_IDS = [
  'gradient1',
  'gradient2',
  'gradient6',
  'gradient14',
  'gradient19',
  'gradient13',
  'unsplash11',
  'unsplash1',
  'unsplash2',
  'unsplash5',
  'unsplash14',
  'unsplash8',
];

const FULL_SIZE_PARAM = 'w=1200';
const THUMB_SIZE_PARAM = 'w=240';

export interface LandingWallpaper extends ChatBackground {
  thumbnail: string | null;
}

export const LANDING_WALLPAPERS: LandingWallpaper[] = LANDING_WALLPAPER_IDS.flatMap((id) => {
  const wallpaper = CHAT_BACKGROUNDS.find((background) => background.id === id);
  if (!wallpaper) {
    return [];
  }
  const thumbnail = wallpaper.isImage && wallpaper.background ? wallpaper.background.replace(FULL_SIZE_PARAM, THUMB_SIZE_PARAM) : wallpaper.background;
  return [{ ...wallpaper, thumbnail }];
});

export const LANDING_WALLPAPER_ID_LIST = LANDING_WALLPAPERS.map((wallpaper) => wallpaper.id);

export function findLandingWallpaper(id: string): LandingWallpaper | undefined {
  return LANDING_WALLPAPERS.find((wallpaper) => wallpaper.id === id);
}
