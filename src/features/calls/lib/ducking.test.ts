import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DUCK_ATTACK_MS, DUCK_HOLD_MS, DUCK_LEVEL, DUCK_RELEASE_MS, Ducker, clampDuckLevel } from './ducking';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function ducker() {
  const levels: number[] = [];
  const instance = new Ducker((level) => levels.push(level));
  return { instance, levels };
}

describe('Ducker', () => {
  it('lowers the share audio to about 12% within the attack time while someone speaks', () => {
    const { instance, levels } = ducker();
    instance.update(true, true);
    vi.advanceTimersByTime(DUCK_ATTACK_MS / 2);
    expect(instance.current).toBeGreaterThan(DUCK_LEVEL);
    expect(instance.current).toBeLessThan(1);
    vi.advanceTimersByTime(DUCK_ATTACK_MS);
    expect(instance.current).toBe(DUCK_LEVEL);
    expect(levels.every((level, index) => index === 0 || level <= levels[index - 1]!)).toBe(true);
  });

  it('holds the duck through short pauses and releases after the hold', () => {
    const { instance } = ducker();
    instance.update(true, true);
    vi.advanceTimersByTime(DUCK_ATTACK_MS);
    instance.update(true, false);
    vi.advanceTimersByTime(DUCK_HOLD_MS - 50);
    instance.update(true, true);
    instance.update(true, false);
    vi.advanceTimersByTime(DUCK_HOLD_MS - 1);
    expect(instance.current).toBe(DUCK_LEVEL);
    vi.advanceTimersByTime(1 + DUCK_RELEASE_MS / 2);
    expect(instance.current).toBeGreaterThan(DUCK_LEVEL);
    expect(instance.current).toBeLessThan(1);
    vi.advanceTimersByTime(DUCK_RELEASE_MS);
    expect(instance.current).toBe(1);
  });

  it('never ducks when movie mode is off and restores when it is turned off mid duck', () => {
    const { instance, levels } = ducker();
    instance.update(false, true);
    vi.advanceTimersByTime(500);
    expect(levels).toEqual([]);

    instance.update(true, true);
    vi.advanceTimersByTime(DUCK_ATTACK_MS);
    instance.update(false, true);
    vi.advanceTimersByTime(DUCK_RELEASE_MS + 40);
    expect(instance.current).toBe(1);
  });

  it('ducks to the level the user picked and follows a change made while ducking', () => {
    const { instance } = ducker();
    instance.update(true, true, 0.4);
    vi.advanceTimersByTime(DUCK_ATTACK_MS * 2);
    expect(instance.current).toBe(0.4);
    instance.update(true, true, 0);
    vi.advanceTimersByTime(DUCK_ATTACK_MS * 2);
    expect(instance.current).toBe(0);
  });

  it('leaves the volume untouched when the user picks 100%', () => {
    const { instance, levels } = ducker();
    instance.update(true, true, 1);
    vi.advanceTimersByTime(DUCK_ATTACK_MS * 2);
    expect(levels).toEqual([]);
    expect(instance.current).toBe(1);
  });

  it('clamps invalid levels', () => {
    expect(clampDuckLevel(-1)).toBe(0);
    expect(clampDuckLevel(3)).toBe(1);
    expect(clampDuckLevel(Number.NaN)).toBe(DUCK_LEVEL);
    expect(clampDuckLevel('x')).toBe(DUCK_LEVEL);
  });

  it('stops every timer on dispose', () => {
    const { instance, levels } = ducker();
    instance.update(true, true);
    instance.dispose();
    vi.advanceTimersByTime(1000);
    expect(levels).toEqual([]);
  });
});
