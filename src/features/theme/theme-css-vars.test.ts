import { describe, expect, it } from 'vitest';
import { gradientStartColor } from './theme-css-vars';

describe('gradientStartColor', () => {
  it('returns the first stop of a hex gradient', () => {
    expect(gradientStartColor('linear-gradient(127deg, #3a4db0 0%, #5e40b8 50%, #7e39a8 100%)', '#000000')).toBe('#3a4db0');
  });

  it('returns the first stop of an rgb gradient', () => {
    expect(gradientStartColor('linear-gradient(127deg,rgb(52, 84, 158) 5%, rgba(99, 60, 150, 1) 51%)', '#000000')).toBe('rgb(52, 84, 158)');
  });

  it('falls back when the gradient has no readable color', () => {
    expect(gradientStartColor('none', '#112233')).toBe('#112233');
  });
});
