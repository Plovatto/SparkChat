import { describe, expect, it } from 'vitest';
import type { RoomParticipant } from '@lib/socket';
import type { ChatMessage } from '../../types';
import { clampViewerIndex, toMediaViewerItems } from './media-viewer-items';

function message(id: string, minute: number, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    roomId: 'room-1',
    sender: { id: 'u1', nickname: 'old-name' },
    content: `blob:${id}`,
    type: 'image',
    duration: null,
    timestamp: `2026-11-20T11:${String(minute).padStart(2, '0')}:00.000Z`,
    deletedForEveryone: false,
    status: 'sent',
    deliveredTo: [],
    readBy: [],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: { name: `${id}.jpg`, mimeType: 'image/jpeg', size: 10 },
    caption: null,
    linkPreview: null,
    ...overrides,
  } as ChatMessage;
}

describe('toMediaViewerItems', () => {
  it('keeps photos and videos in chronological order and skips everything else', () => {
    const items = toMediaViewerItems([
      message('late', 30),
      message('video', 20, { type: 'file', fileMeta: { name: 'clip.mp4', mimeType: 'video/mp4', size: 99 } }),
      message('pdf', 10, { type: 'file', fileMeta: { name: 'doc.pdf', mimeType: 'application/pdf', size: 1 } }),
      message('text', 5, { type: 'text', fileMeta: null }),
      message('early', 1),
      message('deleted', 2, { deletedForEveryone: true }),
      message('pending', 3, { pending: true }),
    ]);
    expect(items.map((item) => [item.id, item.kind])).toEqual([
      ['early', 'image'],
      ['video', 'video'],
      ['late', 'image'],
    ]);
  });

  it('uses the current participant name and avatar and trims the caption', () => {
    const participants = [{ id: 'u1', nickname: 'abruno', avatar: 7 }] as RoomParticipant[];
    const [item] = toMediaViewerItems([message('m1', 1, { caption: '  Olha que fofo  ' })], participants);
    expect(item).toMatchObject({ senderName: 'abruno', senderAvatar: 7, caption: 'Olha que fofo' });
  });

  it('flags gifs and treats blank captions as missing', () => {
    const [item] = toMediaViewerItems([message('g', 1, { caption: '   ', fileMeta: { name: 'a.gif', mimeType: 'image/gif; sparkchat-gif=1', size: 1 } })]);
    expect(item).toMatchObject({ isGif: true, caption: null });
  });
});

describe('clampViewerIndex', () => {
  it('keeps the index inside the list', () => {
    expect(clampViewerIndex(-1, 3)).toBe(0);
    expect(clampViewerIndex(7, 3)).toBe(2);
    expect(clampViewerIndex(1, 3)).toBe(1);
    expect(clampViewerIndex(4, 0)).toBe(0);
  });
});
