import type { IconType } from 'react-icons';
import { FaMoon, FaStar, FaSun } from 'react-icons/fa';
import type { ThemeBaseId } from '@features/theme/constants/theme-bases';

export interface LandingMode {
  id: ThemeBaseId;
  icon: IconType;
}

export const LANDING_MODES: LandingMode[] = [
  { id: 'dark', icon: FaMoon },
  { id: 'light', icon: FaSun },
  { id: 'midnight', icon: FaStar },
];
