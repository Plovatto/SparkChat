import { describe, expect, it } from 'vitest';
import { buildProfileUpdatePayload, isNicknameChange } from './profile-update';

describe('isNicknameChange', () => {
  it('treats a case or whitespace change as the same nickname', () => {
    expect(isNicknameChange('Alice', ' alice ')).toBe(false);
    expect(isNicknameChange('Alice', 'ALICE')).toBe(false);
  });

  it('detects a different nickname', () => {
    expect(isNicknameChange('Alice', 'Alicia')).toBe(true);
  });
});

describe('buildProfileUpdatePayload', () => {
  it('sends the current password when the nickname changes', () => {
    expect(buildProfileUpdatePayload('Alice', ' Alicia ', 2, 'secret-password')).toEqual({
      nickname: 'Alicia',
      avatar: 2,
      currentPassword: 'secret-password',
    });
  });

  it('never sends the password for an avatar-only change', () => {
    expect(buildProfileUpdatePayload('Alice', 'alice', 5, 'secret-password')).toEqual({ nickname: 'alice', avatar: 5 });
  });
});
