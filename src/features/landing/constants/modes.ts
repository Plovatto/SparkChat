import type { IconType } from 'react-icons';
import { FaMoon, FaStar, FaSun } from 'react-icons/fa';
import type { ThemeBaseId } from '@features/theme/constants/theme-bases';

export interface LandingMode {
  id: ThemeBaseId;
  label: string;
  phrase: string;
  icon: IconType;
}

export const LANDING_MODES: LandingMode[] = [
  { id: 'dark', label: 'Escuro', phrase: 'no modo escuro', icon: FaMoon },
  { id: 'light', label: 'Claro', phrase: 'no modo claro', icon: FaSun },
  { id: 'midnight', label: 'Meia-noite', phrase: 'no modo meia-noite', icon: FaStar },
];

export function findLandingMode(id: ThemeBaseId): LandingMode {
  return LANDING_MODES.find((mode) => mode.id === id) ?? (LANDING_MODES[0] as LandingMode);
}
