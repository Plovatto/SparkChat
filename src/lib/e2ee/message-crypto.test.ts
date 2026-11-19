import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket, MessageView } from '@lib/socket';
import { encryptAttachment } from './attachment-crypto';
import { setCurrentIdentity } from './current-identity';
import { clearDecryptedMediaCache } from './media-cache';
import { decryptMediaContentIfNeeded, decryptMessageView, encryptOutgoingMessage, hasUnencryptedFields } from './message-crypto';
import { MissingRoomKeyError } from './room-keys';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

const roomKeys = vi.hoisted(() => new Map<string, Uint8Array>());
const contactSigningKeys = vi.hoisted(() => new Map<string, string>());

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
    lookupContactKey: (_socket: unknown, userId: string) => {
      const signingPublicKey = contactSigningKeys.get(userId);
      return Promise.resolve(signingPublicKey ? { contactId: userId, status: 'verified', pin: { signingPublicKey } } : null);
    },
  };
});

const ROOM_ID = 'room-1';
const OWN_ID = 'user-1';
const socket = {} as AppSocket;

beforeEach(() => {
  contactSigningKeys.clear();
  setCurrentIdentity({ userId: OWN_ID, publicKey: 'unused', privateKey: crypto.getRandomValues(new Uint8Array(32)) });
});

afterEach(() => {
  setCurrentIdentity(null);
});

function viewOf(encrypted: { messageId: string; content: string; caption?: string }): MessageView {
  return toMessageView({ content: encrypted.content, ...(encrypted.caption !== undefined ? { caption: encrypted.caption } : {}), id: encrypted.messageId });
}

function toMessageView(fields: { content: string; caption?: string } & Partial<MessageView>): MessageView {
  return {
    id: 'message-1',
    roomId: ROOM_ID,
    sender: { id: 'user-1', nickname: 'ana', avatar: null },
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
    linkPreview: null,
    ...fields,
    caption: fields.caption ?? null,
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
      expect(value).toMatch(/^e2e:v2:/);
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
        expect(encrypted.content).toMatch(/^e2e:v2:/);

        const decrypted = await decryptMessageView(socket, viewOf(encrypted));
        expect(decrypted.content).toBe(content);
        expect(decrypted.caption).toBe(caption ?? null);
      }),
      { numRuns: 50 },
    );
  });
});

describe('decryptMessageView link preview image', () => {
  beforeEach(() => {
    roomKeys.clear();
    roomKeys.set(ROOM_ID, crypto.getRandomValues(new Uint8Array(32)));
    vi.unstubAllGlobals();
  });

  async function encryptedPreviewMessage(imageUrl: string | null): Promise<MessageView> {
    const encrypted = await encryptOutgoingMessage({
      roomId: ROOM_ID,
      type: 'text',
      content: 'veja https://site.test',
      linkPreview: { url: 'https://site.test', title: 'Site', description: null, imageUrl, siteName: null },
    });
    return { ...viewOf({ messageId: encrypted.messageId, content: encrypted.content }), linkPreview: encrypted.linkPreview ?? null };
  }

  it('drops a legacy plain image URL without fetching it', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const decrypted = await decryptMessageView(socket, await encryptedPreviewMessage('https://tracker.test/pixel.png'));

    expect(decrypted.linkPreview?.title).toBe('Site');
    expect(decrypted.linkPreview?.imageUrl).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('decrypts an image that the sender uploaded encrypted with the room key', async () => {
    const imageUrl = 'https://cdn.test/uploads/images/preview.webp?e2e=1';
    const ciphertext = await encryptAttachment(ROOM_ID, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }));
    const fetchSpy = vi.fn().mockResolvedValue(new Response(ciphertext));
    vi.stubGlobal('fetch', fetchSpy);

    const decrypted = await decryptMessageView(socket, await encryptedPreviewMessage(imageUrl));

    expect(fetchSpy).toHaveBeenCalledWith(imageUrl, expect.objectContaining({ credentials: 'omit' }));
    expect(decrypted.linkPreview?.imageUrl).toMatch(/^blob:/);
  });
});

describe('hasUnencryptedFields', () => {
  const ENCRYPTED_TEXT = 'e2e:v1:AAAA';
  const AUTHENTICATED_TEXT = 'e2e:v2:AAAA';

  it('flags plaintext text, captions, file details and link previews', () => {
    expect(hasUnencryptedFields(toMessageView({ content: 'olá' }))).toBe(true);
    expect(hasUnencryptedFields(toMessageView({ content: ENCRYPTED_TEXT, caption: 'legenda' }))).toBe(true);
    expect(
      hasUnencryptedFields(
        toMessageView({
          content: 'https://cdn.test/uploads/files/a.bin?e2e=1',
          type: 'file',
          fileMeta: { name: 'nota.pdf', mimeType: ENCRYPTED_TEXT, size: 1 },
        }),
      ),
    ).toBe(true);
    expect(
      hasUnencryptedFields(
        toMessageView({
          content: ENCRYPTED_TEXT,
          linkPreview: { url: ENCRYPTED_TEXT, title: 'Plain title', description: null, imageUrl: null, siteName: null },
        }),
      ),
    ).toBe(true);
  });

  it('flags media urls that were not encrypted on upload', () => {
    expect(hasUnencryptedFields(toMessageView({ content: 'https://cdn.test/uploads/images/a.png', type: 'image' }))).toBe(true);
    expect(
      hasUnencryptedFields(
        toMessageView({
          content: 'https://cdn.test/uploads/images/a.png?e2e=1',
          type: 'image',
          fileMeta: { name: ENCRYPTED_TEXT, mimeType: ENCRYPTED_TEXT, size: 1, thumbnailUrl: 'https://cdn.test/uploads/images/t.webp' },
        }),
      ),
    ).toBe(true);
  });

  it('does not flag fully encrypted, system, error or deleted messages', () => {
    expect(hasUnencryptedFields(toMessageView({ content: ENCRYPTED_TEXT, caption: ENCRYPTED_TEXT }))).toBe(false);
    expect(hasUnencryptedFields(toMessageView({ content: AUTHENTICATED_TEXT, caption: AUTHENTICATED_TEXT }))).toBe(false);
    expect(
      hasUnencryptedFields(
        toMessageView({
          content: 'https://cdn.test/uploads/images/a.png?e2e=1',
          type: 'image',
          fileMeta: { name: ENCRYPTED_TEXT, mimeType: ENCRYPTED_TEXT, size: 1, thumbnailUrl: 'https://cdn.test/uploads/images/t.webp?e2e=1' },
        }),
      ),
    ).toBe(false);
    expect(hasUnencryptedFields(toMessageView({ content: 'entrou na sala', type: 'system' }))).toBe(false);
    expect(hasUnencryptedFields(toMessageView({ content: 'falhou', type: 'error' }))).toBe(false);
    expect(hasUnencryptedFields(toMessageView({ content: '', deletedForEveryone: true }))).toBe(false);
  });

  it('marks decrypted views that arrived without encryption', async () => {
    roomKeys.set(ROOM_ID, crypto.getRandomValues(new Uint8Array(32)));
    const plain = await decryptMessageView(socket, toMessageView({ content: 'olá' }));
    const encrypted = await decryptMessageView(socket, viewOf(await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'olá' })));

    expect(plain.unencrypted).toBe(true);
    expect(encrypted.unencrypted).toBe(false);
    expect(encrypted.content).toBe('olá');
  });
});

describe('decryptMediaContentIfNeeded', () => {
  const MEDIA_URL = 'https://cdn.test/uploads/files/payload.bin?e2e=1';
  const createdBlobs: Blob[] = [];
  const fetchMock = vi.fn<typeof fetch>();
  let ciphertext: ArrayBuffer;

  const fileMeta = (mimeType: string) => ({ name: 'x', mimeType, size: 1 });

  beforeEach(async () => {
    roomKeys.clear();
    roomKeys.set(ROOM_ID, crypto.getRandomValues(new Uint8Array(32)));
    createdBlobs.length = 0;
    const html = new Blob(['<script>alert(1)</script>'], { type: 'text/html' });
    ciphertext = await (await encryptAttachment(ROOM_ID, html)).arrayBuffer();
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(new Response(ciphertext.slice(0))));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      createdBlobs.push(blob as Blob);
      return `blob:https://app.test/${createdBlobs.length}`;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clearDecryptedMediaCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('never creates an active blob type from the sender-chosen mime type', async () => {
    await decryptMediaContentIfNeeded(socket, MEDIA_URL, ROOM_ID, fileMeta('text/html'), 'file');
    clearDecryptedMediaCache();
    await decryptMediaContentIfNeeded(socket, MEDIA_URL, ROOM_ID, fileMeta('image/svg+xml'), 'image');
    clearDecryptedMediaCache();
    await decryptMediaContentIfNeeded(socket, MEDIA_URL, ROOM_ID, fileMeta('application/pdf'), 'image');

    expect(createdBlobs.map((blob) => blob.type)).toEqual(['application/octet-stream', 'application/octet-stream', 'application/octet-stream']);
  });

  it('keeps passive types that match the message type', async () => {
    await decryptMediaContentIfNeeded(socket, MEDIA_URL, ROOM_ID, fileMeta('image/png'), 'image');
    clearDecryptedMediaCache();
    await decryptMediaContentIfNeeded(socket, MEDIA_URL, ROOM_ID, fileMeta('audio/webm;codecs=opus'), 'audio');
    clearDecryptedMediaCache();
    await decryptMediaContentIfNeeded(socket, MEDIA_URL, ROOM_ID, fileMeta('application/pdf'), 'file');

    expect(createdBlobs.map((blob) => blob.type)).toEqual(['image/png', 'audio/webm', 'application/pdf']);
  });

  it('does not let a second message reusing the url inherit the first message type', async () => {
    const first = await decryptMediaContentIfNeeded(socket, MEDIA_URL, ROOM_ID, fileMeta('text/html'), 'file');
    const second = await decryptMediaContentIfNeeded(socket, MEDIA_URL, ROOM_ID, fileMeta('application/pdf'), 'file');

    expect(first).not.toBe(second);
    expect(createdBlobs.map((blob) => blob.type)).toEqual(['application/octet-stream', 'application/pdf']);
  });

  it('never fetches media outside the storage upload paths', async () => {
    const outside = 'https://evil.test/payload.bin?e2e=1';
    await expect(decryptMediaContentIfNeeded(socket, outside, ROOM_ID, fileMeta('image/png'), 'image')).resolves.toBe(outside);
    const insecure = 'http://cdn.test/uploads/images/a.png?e2e=1';
    await expect(decryptMediaContentIfNeeded(socket, insecure, ROOM_ID, fileMeta('image/png'), 'image')).resolves.toBe(insecure);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('authenticated message fields', () => {
  beforeEach(() => {
    roomKeys.clear();
    roomKeys.set(ROOM_ID, crypto.getRandomValues(new Uint8Array(32)));
  });

  async function unavailableText(view: MessageView): Promise<boolean> {
    const decrypted = await decryptMessageView(socket, view);
    return decrypted.content !== 'segredo';
  }

  it('generates a unique message id for every message', async () => {
    const first = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'a' });
    const second = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'a' });
    expect(first.messageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.messageId).not.toBe(second.messageId);
  });

  it('opens a message only for the room, sender and id it was sealed for', async () => {
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'segredo' });
    const view = viewOf(encrypted);

    expect(await unavailableText(view)).toBe(false);
    expect(await unavailableText({ ...view, id: 'another-message' })).toBe(true);
    expect(await unavailableText({ ...view, roomId: 'room-2' })).toBe(true);
    expect(await unavailableText({ ...view, sender: { ...view.sender, id: 'user-2' } })).toBe(true);
  });

  it('does not accept a field moved to another slot of the same message', async () => {
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'segredo', caption: 'legenda' });
    const swapped = { ...viewOf(encrypted), content: encrypted.caption };
    expect(await unavailableText(swapped)).toBe(true);
  });

  it('rejects a message whose signature does not come from the claimed sender', async () => {
    const sodium = await getSodium();
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'segredo' });
    const view = viewOf(encrypted);
    const forged = { ...view, sender: { ...view.sender, id: 'user-2' } };
    const otherKey = await deriveSigningKeyPair(crypto.getRandomValues(new Uint8Array(32)));
    contactSigningKeys.set('user-2', sodium.to_base64(otherKey.publicKey));

    expect(await unavailableText(forged)).toBe(true);
  });

  it('rejects a message from a sender without a known signing key', async () => {
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'segredo' });
    const view = viewOf(encrypted);
    setCurrentIdentity({ userId: 'user-9', publicKey: 'unused', privateKey: crypto.getRandomValues(new Uint8Array(32)) });
    expect(await unavailableText(view)).toBe(true);
  });

  it('verifies a message from another member with the pinned signing key', async () => {
    const sodium = await getSodium();
    const senderPrivateKey = crypto.getRandomValues(new Uint8Array(32));
    setCurrentIdentity({ userId: 'user-2', publicKey: 'unused', privateKey: senderPrivateKey });
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'segredo' });
    const view = { ...viewOf(encrypted), sender: { id: 'user-2', nickname: 'bia', avatar: null } };

    setCurrentIdentity({ userId: OWN_ID, publicKey: 'unused', privateKey: crypto.getRandomValues(new Uint8Array(32)) });
    contactSigningKeys.set('user-2', sodium.to_base64((await deriveSigningKeyPair(senderPrivateKey)).publicKey));

    expect(await unavailableText(view)).toBe(false);
  });

  it('still opens messages in the legacy format', async () => {
    const sodium = await getSodium();
    const key = roomKeys.get(ROOM_ID) as Uint8Array;
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const sealed = sodium.crypto_secretbox_easy('segredo', nonce, key);
    const combined = new Uint8Array(nonce.length + sealed.length);
    combined.set(nonce, 0);
    combined.set(sealed, nonce.length);

    const decrypted = await decryptMessageView(socket, toMessageView({ content: 'e2e:v1:' + sodium.to_base64(combined) }));
    expect(decrypted.content).toBe('segredo');
    expect(decrypted.unencrypted).toBe(false);
  });
});
