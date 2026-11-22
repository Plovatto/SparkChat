import { CHAT_BACKGROUNDS, type ChatBackground } from '@features/theme/constants/chat-backgrounds';

const LANDING_WALLPAPER_IDS = [
  'gradient1',
  'gradient2',
  'gradient6',
  'gradient14',
  'unsplash11',
  'unsplash67',
  'unsplash65',
  'unsplash1',
  'unsplash73',
  'unsplash76',
  'unsplash77',
  'unsplash14',
  'unsplash68',
  'unsplash89',
  'unsplash82',
  'unsplash114',
  'unsplash72',
  'unsplash86',
  'unsplash5',
  'unsplash71',
  'unsplash88',
  'unsplash94',
  'unsplash2',
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
