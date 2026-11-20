export type WarpTone = 'ink' | 'accent';

export interface WarpParticle {
  angle: number;
  radius: number;
  previousRadius: number;
  speed: number;
  size: number;
  tone: WarpTone;
}

export const WARP_SPAWN_MIN_RADIUS = 24;
export const WARP_SPAWN_RANGE = 70;
export const WARP_MAX_BOOST = 3;
export const WARP_RAMP_MS = 900;

const MIN_PARTICLES = 40;
const MAX_PARTICLES = 110;
const AREA_PER_PARTICLE = 14000;
const SPEED_SCALE = 0.028;
const RADIUS_ACCELERATION = 180;
const CLEAR_ZONE_RADIUS = 130;
const FADE_IN_DISTANCE = 200;

export function particleCount(width: number, height: number): number {
  return Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, Math.round((width * height) / AREA_PER_PARTICLE)));
}

export function spawnParticle(random: () => number, maxRadius: number, scatter: boolean): WarpParticle {
  const radius = scatter ? WARP_SPAWN_MIN_RADIUS + random() * Math.max(0, maxRadius - WARP_SPAWN_MIN_RADIUS) : WARP_SPAWN_MIN_RADIUS + random() * WARP_SPAWN_RANGE;
  return {
    angle: random() * Math.PI * 2,
    radius,
    previousRadius: radius,
    speed: 0.25 + random() * 0.9,
    size: 0.6 + random() * 1.6,
    tone: random() < 0.28 ? 'accent' : 'ink',
  };
}

export function stepParticle(particle: WarpParticle, elapsedMs: number, warp: number, maxRadius: number, random: () => number): WarpParticle {
  const growth = particle.speed * (1 + particle.radius / RADIUS_ACCELERATION) * warp * elapsedMs * SPEED_SCALE;
  const radius = particle.radius + growth;
  if (radius > maxRadius) {
    return spawnParticle(random, maxRadius, false);
  }
  return { ...particle, previousRadius: particle.radius, radius };
}

export function warpBoost(leavingForMs: number | null): number {
  if (leavingForMs === null) {
    return 1;
  }
  const progress = Math.min(1, Math.max(0, leavingForMs / WARP_RAMP_MS));
  return 1 + (WARP_MAX_BOOST - 1) * progress * progress;
}

export function particleAlpha(radius: number, maxRadius: number): number {
  const fadeIn = Math.min(1, Math.max(0, (radius - CLEAR_ZONE_RADIUS) / FADE_IN_DISTANCE));
  const fadeOut = Math.min(1, Math.max(0, (maxRadius - radius) / 80));
  return Math.min(fadeIn, fadeOut) * 0.7;
}
