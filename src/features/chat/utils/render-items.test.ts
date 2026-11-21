import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import { buildRenderItems, canDeleteMessage, canJoinRun, isAlbumCandidate, MIN_ALBUM_SIZE, renderItemKey } from './render-items';

let sequence = 0;

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  sequence += 1;
  return {
    id: `m${sequence}`,
    roomId: 'r1',
    sender: { id: 'u1', nickname: 'ana', avatar: 0 },
    content: `https://cdn.test/${sequence}`,
    type: 'image',
    duration: null,
    timestamp: new Date(Date.UTC(2026, 10, 20, 12, 0, sequence)).toISOString(),
    deletedForEveryone: false,
    status: 'sent',
    deliveredTo: [],
    readBy: [],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: { name: `${sequence}.png`, size: 10, mimeType: 'image/png' },
    caption: null,
    linkPreview: null,
    ...overrides,
  };
}

const video = (overrides: Partial<ChatMessage> = {}) =>
  message({ type: 'file', fileMeta: { name: 'clip.mp4', size: 10, mimeType: 'video/mp4' }, ...overrides });

describe('isAlbumCandidate', () => {
  it('accepts plain photos and videos', () => {
    expect(isAlbumCandidate(message())).toBe(true);
    expect(isAlbumCandidate(video())).toBe(true);
  });

  it('rejects captions, replies, gifs, documents and unsent messages', () => {
    expect(isAlbumCandidate(message({ caption: 'oi' }))).toBe(false);
    expect(isAlbumCandidate(message({ replyTo: { id: 'x' } as ChatMessage['replyTo'] }))).toBe(false);
    expect(isAlbumCandidate(message({ fileMeta: { name: 'a.gif', size: 1, mimeType: 'image/gif; sparkchat-gif=1' } }))).toBe(false);
    expect(isAlbumCandidate(message({ type: 'file', fileMeta: { name: 'a.pdf', size: 1, mimeType: 'application/pdf' } }))).toBe(false);
    expect(isAlbumCandidate(message({ pending: true }))).toBe(false);
  });
});

describe('buildRenderItems', () => {
  it('groups four or more consecutive media from the same sender into an album', () => {
    const media = [message(), video(), message(), message(), message()];
    const items = buildRenderItems(media, new Map());
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('image-group');
    expect(items[0]?.kind === 'image-group' && items[0].messages).toHaveLength(5);
  });

  it('keeps fewer than four media as separate messages', () => {
    const media = Array.from({ length: MIN_ALBUM_SIZE - 1 }, () => message());
    const items = buildRenderItems(media, new Map());
    expect(items.map((item) => item.kind)).toEqual(['single', 'single', 'single']);
  });

  it('never puts a captioned photo in an album and splits around it', () => {
    const media = [message(), message(), message({ caption: 'legenda' }), message(), message()];
    const items = buildRenderItems(media, new Map());
    expect(items.every((item) => item.kind === 'single')).toBe(true);
    expect(items).toHaveLength(5);
  });

  it('does not mix senders in one album', () => {
    const other = { id: 'u2', nickname: 'bia', avatar: 1 } as ChatMessage['sender'];
    const media = [message(), message(), message({ sender: other }), message(), message()];
    expect(buildRenderItems(media, new Map()).every((item) => item.kind === 'single')).toBe(true);
  });

  it('reuses the previous album array when nothing changed', () => {
    const media = [message(), message(), message(), message()];
    const first = buildRenderItems(media, new Map());
    const group = first[0];
    if (group?.kind !== 'image-group') {
      throw new Error('expected album');
    }
    const second = buildRenderItems(media, new Map([[group.messages[0].id, group.messages]]));
    expect(second[0]?.kind === 'image-group' && second[0].messages).toBe(group.messages);
    expect(renderItemKey(second[0]!)).toBe(`group-${group.messages[0].id}`);
  });
});

describe('canJoinRun', () => {
  it('joins close messages from the same sender', () => {
    const first = message({ type: 'text' });
    const second = message({ type: 'text' });
    expect(canJoinRun(first, second)).toBe(true);
  });

  it('breaks on another sender, a long pause or system messages', () => {
    const first = message({ type: 'text' });
    const other = message({ type: 'text', sender: { id: 'u2', nickname: 'bia', avatar: 1 } });
    const later = message({ type: 'text', timestamp: new Date(Date.parse(first.timestamp) + 6 * 60 * 1000).toISOString() });
    const system = message({ type: 'system' });
    expect(canJoinRun(first, other)).toBe(false);
    expect(canJoinRun(first, later)).toBe(false);
    expect(canJoinRun(first, system)).toBe(false);
  });
});

describe('canDeleteMessage', () => {
  it('allows deleting only own messages for now', () => {
    expect(canDeleteMessage(true)).toBe(true);
    expect(canDeleteMessage(false)).toBe(false);
  });
});
