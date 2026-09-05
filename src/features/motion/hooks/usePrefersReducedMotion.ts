import { useMediaQuery } from '@hooks/useMediaQuery';
import { REDUCED_MOTION_QUERY } from '../constants/motion';

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}
