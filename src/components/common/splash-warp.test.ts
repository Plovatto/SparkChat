import { describe, expect, it } from 'vitest';
import {
  particleAlpha,
  particleCount,
  spawnParticle,
  stepParticle,
  WARP_MAX_BOOST,
  WARP_RAMP_MS,
  WARP_SPAWN_MIN_RADIUS,
  WARP_SPAWN_RANGE,
  warpBoost,
} from './splash-warp';

function sequence(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

describe('splash warp field', () => {
  it('scales the particle count with the screen and keeps it within bounds', () => {
    expect(particleCount(320, 480)).toBe(40);
    expect(particleCount(1280, 800)).toBe(73);
    expect(particleCount(3840, 2160)).toBe(110);
  });

  it('spawns new particles close to the center and scattered ones across the field', () => {
    const fresh = spawnParticle(sequence([0.5, 0.5, 0.5, 0.5, 0.9]), 600, false);
    expect(fresh.radius).toBeGreaterThanOrEqual(WARP_SPAWN_MIN_RADIUS);
    expect(fresh.radius).toBeLessThanOrEqual(WARP_SPAWN_MIN_RADIUS + WARP_SPAWN_RANGE);
    expect(fresh.previousRadius).toBe(fresh.radius);
    expect(fresh.tone).toBe('ink');

    const scattered = spawnParticle(sequence([1, 0, 0, 0, 0.1]), 600, true);
    expect(scattered.radius).toBe(600);
    expect(scattered.tone).toBe('accent');
  });

  it('moves particles outward faster the further they are and faster in warp', () => {
    const random = sequence([0.5]);
    const particle = spawnParticle(random, 600, false);
    const cruising = stepParticle(particle, 16, 1, 600, random);
    const warping = stepParticle(particle, 16, WARP_MAX_BOOST, 600, random);

    expect(cruising.previousRadius).toBe(particle.radius);
    expect(cruising.radius).toBeGreaterThan(particle.radius);
    expect(warping.radius - particle.radius).toBeCloseTo((cruising.radius - particle.radius) * WARP_MAX_BOOST);
  });

  it('respawns a particle near the center once it leaves the field', () => {
    const random = sequence([0.5]);
    const particle = { ...spawnParticle(random, 600, false), radius: 599, previousRadius: 590 };
    const next = stepParticle(particle, 500, 1, 600, random);

    expect(next.radius).toBeLessThanOrEqual(WARP_SPAWN_MIN_RADIUS + WARP_SPAWN_RANGE);
  });

  it('ramps the warp boost from cruising to full speed during the exit', () => {
    expect(warpBoost(null)).toBe(1);
    expect(warpBoost(0)).toBe(1);
    expect(warpBoost(WARP_RAMP_MS / 2)).toBeGreaterThan(1);
    expect(warpBoost(WARP_RAMP_MS / 2)).toBeLessThan(WARP_MAX_BOOST);
    expect(warpBoost(WARP_RAMP_MS * 3)).toBe(WARP_MAX_BOOST);
  });

  it('keeps the logo area clear, fades particles in and out at the edge', () => {
    expect(particleAlpha(0, 800)).toBe(0);
    expect(particleAlpha(120, 800)).toBe(0);
    expect(particleAlpha(230, 800)).toBeCloseTo(0.35);
    expect(particleAlpha(400, 800)).toBeCloseTo(0.7);
    expect(particleAlpha(800, 800)).toBe(0);
  });
});
