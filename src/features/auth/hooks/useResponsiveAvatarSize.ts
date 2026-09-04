import { MEDIUM_SCREEN_MIN_WIDTH_PX, minWidthQuery } from '@constants/breakpoints';
import { useMediaQuery } from '@hooks/useMediaQuery';

export interface ResponsiveAvatarSize {
  avatarSize: number;
  iconSize: number;
}

const SMALL_SCREEN_SIZE: ResponsiveAvatarSize = { avatarSize: 58, iconSize: 30 };
const DEFAULT_SIZE: ResponsiveAvatarSize = { avatarSize: 75, iconSize: 40 };

export function useResponsiveAvatarSize(): ResponsiveAvatarSize {
  const isMediumOrWider = useMediaQuery(minWidthQuery(MEDIUM_SCREEN_MIN_WIDTH_PX));
  return isMediumOrWider ? DEFAULT_SIZE : SMALL_SCREEN_SIZE;
}
