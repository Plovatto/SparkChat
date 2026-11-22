import { describe, expect, it } from 'vitest';
import type { MessageSender, RoomParticipant } from '@lib/socket';
import { resolveSenderAvatar } from './sender-avatar';

const member = { id: 'u1', nickname: 'ana', avatar: 3 } as RoomParticipant;

describe('resolveSenderAvatar', () => {
  it('prefers the current roster avatar', () => {
    const sender: MessageSender = { id: 'u1', nickname: 'ana', avatar: 1 };
    expect(resolveSenderAvatar([member], sender)).toBe(3);
  });

  it('falls back to the avatar sent with the message when the sender left the group', () => {
    const sender: MessageSender = { id: 'u2', nickname: 'bia', avatar: 5 };
    expect(resolveSenderAvatar([member], sender)).toBe(5);
  });

  it('returns undefined when neither source has an avatar', () => {
    const sender: MessageSender = { id: 'u2', nickname: 'bia', avatar: null };
    expect(resolveSenderAvatar([member], sender)).toBeUndefined();
  });
});
