export const MOTION_DURATION_MS = {
  instant: 90,
  fast: 140,
  normal: 220,
  slow: 320,
  slower: 460,
} as const;

export type MotionDurationName = keyof typeof MOTION_DURATION_MS;

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
