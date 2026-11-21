import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import { chunkMessageIds, isSelectableMessage, resolveDeleteOptions } from './delete-options';

function message(overrides: Partial<ChatMessage> & { id: string; senderId: string }): ChatMessage {
  const { senderId, ...rest } = overrides;
  return {
    roomId: 'r',
    sender: { id: senderId, nickname: senderId, avatar: 0 },
    content: 'x',
    type: 'text',
    duration: null,
    timestamp: '2026-11-20T12:00:00.000Z',
    deletedForEveryone: false,
    status: 'sent',
    deliveredTo: [],
    readBy: [],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: null,
    caption: null,
    linkPreview: null,
    ...rest,
  };
}

describe('resolveDeleteOptions', () => {
  it('allows deleting for everyone only when every message is your own and still there', () => {
    const own = message({ id: 'a', senderId: 'me' });
    const ownImage = message({ id: 'b', senderId: 'me', type: 'image' });
    expect(resolveDeleteOptions([own, ownImage], 'me')).toEqual({ count: 2, canDeleteForEveryone: true });
  });

  it('falls back to deleting only for yourself for mixed, deleted, system or unsent selections', () => {
    const own = message({ id: 'a', senderId: 'me' });
    expect(resolveDeleteOptions([own, message({ id: 'b', senderId: 'other' })], 'me').canDeleteForEveryone).toBe(false);
    expect(resolveDeleteOptions([message({ id: 'c', senderId: 'me', deletedForEveryone: true })], 'me').canDeleteForEveryone).toBe(false);
    expect(resolveDeleteOptions([message({ id: 'd', senderId: 'me', pending: true })], 'me').canDeleteForEveryone).toBe(false);
    expect(resolveDeleteOptions([message({ id: 'e', senderId: 'me', failed: true })], 'me').canDeleteForEveryone).toBe(false);
    expect(resolveDeleteOptions([message({ id: 'f', senderId: 'system', type: 'system' })], 'me').canDeleteForEveryone).toBe(false);
    expect(resolveDeleteOptions([], 'me')).toEqual({ count: 0, canDeleteForEveryone: false });
  });
});

describe('chunkMessageIds', () => {
  it('drops repeated ids and splits into batches the server accepts', () => {
    const ids = Array.from({ length: 205 }, (_, index) => `m${index}`);
    expect(chunkMessageIds([...ids, 'm0']).map((batch) => batch.length)).toEqual([100, 100, 5]);
    expect(chunkMessageIds([])).toEqual([]);
  });
});

describe('isSelectableMessage', () => {
  it('skips messages that are still sending, failed or leaving', () => {
    expect(isSelectableMessage(message({ id: 'a', senderId: 'me' }))).toBe(true);
    expect(isSelectableMessage(message({ id: 'b', senderId: 'me', pending: true }))).toBe(false);
    expect(isSelectableMessage(message({ id: 'c', senderId: 'me', failed: true }))).toBe(false);
    expect(isSelectableMessage(message({ id: 'd', senderId: 'me', exiting: true }))).toBe(false);
  });
});
