import { describe, expect, it } from 'vitest';
import { ASSISTANT_AVATAR_INDEX, AVATARS, SELECTABLE_AVATARS } from './avatars';

describe('selectable avatars', () => {
  it('keeps the robot only for SparkAI', () => {
    expect(AVATARS[ASSISTANT_AVATAR_INDEX]?.name).toBe('Robot');
    expect(SELECTABLE_AVATARS.map(({ avatar }) => avatar.name)).not.toContain('Robot');
  });

  it('keeps every other avatar with its stored index', () => {
    expect(SELECTABLE_AVATARS).toHaveLength(AVATARS.length - 1);
    for (const { avatar, index } of SELECTABLE_AVATARS) {
      expect(AVATARS[index]).toBe(avatar);
    }
  });
});
