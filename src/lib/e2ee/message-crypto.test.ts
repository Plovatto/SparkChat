import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket, MessageView } from '@lib/socket';
import { decryptMessageView, encryptOutgoingMessage } from './message-crypto';
import { MissingRoomKeyError } from './room-keys';

const roomKeys = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock('./room-keys', () => {
  class MissingRoomKeyError extends Error {}
  return {
    MissingRoomKeyError,
    getCachedRoomKey: (roomId: string) => roomKeys.get(roomId) ?? null,
    requireCachedRoomKey: (roomId: string) => {
      const key = roomKeys.get(roomId);
      if (!key) {
        throw new MissingRoomKeyError();
      }
      return key;
    },
    ensureRoomKeyForDecryption: (_socket: unknown, roomId: string) => Promise.resolve(roomKeys.get(roomId) ?? null),
    refetchRoomKeyAfterDecryptionFailure: () => Promise.resolve(null),
  };
});

const ROOM_ID = 'room-1';
const socket = {} as AppSocket;

function toMessageView(fields: { content: string; caption?: string }): MessageView {
  return {
    id: 'message-1',
    roomId: ROOM_ID,
    sender: { id: 'user-1', nickname: 'ana', avatar: null },
    content: fields.content,
    type: 'text',
    duration: null,
    timestamp: new Date(0).toISOString(),
    deletedForEveryone: false,
    status: 'sent',
    deliveredTo: [],
    readBy: [],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: null,
    caption: fields.caption ?? null,
    linkPreview: null,
  };
}

describe('encryptOutgoingMessage', () => {
  beforeEach(() => {
    roomKeys.clear();
    roomKeys.set(ROOM_ID, crypto.getRandomValues(new Uint8Array(32)));
  });

  it('refuses to return a message when the room key is missing', async () => {
    roomKeys.clear();
    await expect(encryptOutgoingMessage({ roomId: ROOM_ID, content: 'olá' })).rejects.toBeInstanceOf(MissingRoomKeyError);
  });

  it('encrypts text, caption, file details and link preview', async () => {
    const encrypted = await encryptOutgoingMessage({
      roomId: ROOM_ID,
      type: 'text',
      content: 'olá',
      caption: 'legenda',
      fileMeta: { name: 'foto.png', mimeType: 'image/png', size: 10 },
      linkPreview: { url: 'https://site.test', title: 'Site', description: null, imageUrl: null, siteName: 'Site' },
    });

    const values = [
      encrypted.content,
      encrypted.caption,
      encrypted.fileMeta?.name,
      encrypted.fileMeta?.mimeType,
      encrypted.linkPreview?.url,
      encrypted.linkPreview?.title,
      encrypted.linkPreview?.siteName,
    ];
    for (const value of values) {
      expect(value).toMatch(/^e2e:v1:/);
    }
    expect(encrypted.linkPreview?.description).toBeNull();
    expect(encrypted.fileMeta?.size).toBe(10);
  });

  it('keeps the url of media that was encrypted on upload', async () => {
    const url = 'https://cdn.test/uploads/images/abc.png?e2e=1';
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, type: 'image', content: url });
    expect(encrypted.content).toBe(url);
  });

  it('never sends the plaintext and decrypts back to it', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), fc.option(fc.string({ minLength: 1 }), { nil: undefined }), async (content, caption) => {
        const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content, caption });
        expect(encrypted.content).not.toBe(content);
        expect(encrypted.content).toMatch(/^e2e:v1:/);

        const decrypted = await decryptMessageView(socket, toMessageView(encrypted));
        expect(decrypted.content).toBe(content);
        expect(decrypted.caption).toBe(caption ?? null);
      }),
      { numRuns: 50 },
    );
  });
});
