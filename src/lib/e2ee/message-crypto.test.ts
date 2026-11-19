import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket, MessageView } from '@lib/socket';
import { translate } from '@lib/i18n/app-i18n';
import { sealAttachment, type AttachmentBinding } from './attachment-crypto';
import { sealAuthenticatedField } from './authenticated-field';
import { setCurrentIdentity } from './current-identity';
import { clearDecryptedMediaCache, isExpiredMediaUrl } from './media-cache';
import { decryptMediaContentIfNeeded, decryptMessageView, encryptOutgoingMessage, hasUnencryptedFields } from './message-crypto';
import { MissingRoomKeyError } from './room-keys';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';
import { padGif } from '@lib/media/gif-padding';

const roomKeys = vi.hoisted(() => new Map<string, { keyId: string; epoch: number; key: Uint8Array }[]>());
const contactSigningKeys = vi.hoisted(() => new Map<string, string>());

vi.mock('./room-keys', () => {
  class MissingRoomKeyError extends Error {}
  return {
    MissingRoomKeyError,
    requireCurrentRoomKey: (roomId: string) => {
      const current = roomKeys.get(roomId)?.at(-1);
      if (!current) {
        throw new MissingRoomKeyError();
      }
      return current;
    },
    ensureRoomKeyGeneration: (_socket: unknown, roomId: string, keyId: string) =>
      Promise.resolve(roomKeys.get(roomId)?.find((generation) => generation.keyId === keyId)?.key ?? null),
    lookupContactKey: (_socket: unknown, userId: string) => {
      const signingPublicKey = contactSigningKeys.get(userId);
      return Promise.resolve(signingPublicKey ? { contactId: userId, status: 'verified', pin: { signingPublicKey } } : null);
    },
  };
});

const ROOM_ID = 'room-1';
const MESSAGE_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER_MESSAGE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function randomKeyId(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function addGeneration(roomId: string): { keyId: string; epoch: number; key: Uint8Array } {
  const generations = roomKeys.get(roomId) ?? [];
  const generation = { keyId: randomKeyId(), epoch: generations.length + 1, key: crypto.getRandomValues(new Uint8Array(32)) };
  roomKeys.set(roomId, [...generations, generation]);
  return generation;
}

function currentGeneration(roomId: string): { keyId: string; epoch: number; key: Uint8Array } {
  const current = roomKeys.get(roomId)?.at(-1);
  if (!current) {
    throw new Error('no generation');
  }
  return current;
}
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
    addGeneration(ROOM_ID);
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
      caption: 'caption',
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
    const fileMeta = { name: 'abc.png', mimeType: 'image/png', size: 1 };
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, type: 'image', content: url, fileMeta });
    expect(encrypted.content).toBe(url);
    expect(encrypted.messageId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses the message id chosen before the upload and seals every attachment key', async () => {
    const fileMeta = {
      name: 'foto.png',
      mimeType: 'image/png',
      size: 10,
      thumbnailUrl: 'https://cdn.test/uploads/images/t.bin?e2e=1',
      key: 'a'.repeat(43),
      thumbnailKey: 'b'.repeat(43),
    };
    const encrypted = await encryptOutgoingMessage({
      roomId: ROOM_ID,
      type: 'image',
      content: 'https://cdn.test/uploads/images/abc.bin?e2e=1',
      fileMeta,
      messageId: MESSAGE_ID,
    });

    expect(encrypted.messageId).toBe(MESSAGE_ID);
    expect(encrypted.fileMeta?.key).toMatch(/^e2e:v2:/);
    expect(encrypted.fileMeta?.thumbnailKey).toMatch(/^e2e:v2:/);
    expect(encrypted.fileMeta?.thumbnailUrl).toBe(fileMeta.thumbnailUrl);
    expect(JSON.stringify(encrypted)).not.toContain('a'.repeat(43));
    expect(JSON.stringify(encrypted)).not.toContain('b'.repeat(43));
  });

  it('refuses a caller supplied message id that is not a UUID', async () => {
    await expect(encryptOutgoingMessage({ roomId: ROOM_ID, content: 'olá', messageId: 'not-a-uuid' })).rejects.toThrow();
  });

  it('refuses attachment messages without file details', async () => {
    for (const type of ['image', 'audio', 'file']) {
      await expect(encryptOutgoingMessage({ roomId: ROOM_ID, type, content: 'https://cdn.test/uploads/x?e2e=1' })).rejects.toThrow();
    }
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
    addGeneration(ROOM_ID);
    vi.unstubAllGlobals();
  });

  async function encryptedPreviewMessage(imageUrl: string | null, previewKey?: string): Promise<MessageView> {
    const encrypted = await encryptOutgoingMessage({
      roomId: ROOM_ID,
      type: 'text',
      content: 'veja https://site.test',
      messageId: MESSAGE_ID,
      linkPreview: { url: 'https://site.test', title: 'Site', description: null, imageUrl, siteName: null },
      ...(previewKey ? { fileMeta: { name: 'link-preview', mimeType: 'image/webp', size: 3, previewKey } } : {}),
    });
    return {
      ...viewOf({ messageId: encrypted.messageId, content: encrypted.content }),
      linkPreview: encrypted.linkPreview ?? null,
      fileMeta: encrypted.fileMeta ?? null,
    };
  }

  it('drops a legacy plain image URL without fetching it', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const decrypted = await decryptMessageView(socket, await encryptedPreviewMessage('https://tracker.test/pixel.png'));

    expect(decrypted.linkPreview?.title).toBe('Site');
    expect(decrypted.linkPreview?.imageUrl).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('decrypts an image uploaded with its own preview key bound to the message', async () => {
    const imageUrl = 'https://cdn.test/uploads/images/preview.webp?e2e=1';
    const { ciphertext, key } = await sealAttachment(new Blob([new Uint8Array([1, 2, 3])]), { roomId: ROOM_ID, messageId: MESSAGE_ID, slot: 'preview' });
    const fetchSpy = vi.fn().mockResolvedValue(new Response(ciphertext));
    vi.stubGlobal('fetch', fetchSpy);

    const decrypted = await decryptMessageView(socket, await encryptedPreviewMessage(imageUrl, key));

    expect(fetchSpy).toHaveBeenCalledWith(imageUrl, expect.objectContaining({ credentials: 'omit' }));
    expect(decrypted.linkPreview?.imageUrl).toMatch(/^blob:/);
    expect(decrypted.fileMeta?.previewKey).toBe(key);
    clearDecryptedMediaCache();
  });

  it('drops a preview image sealed for another slot or without a preview key', async () => {
    const imageUrl = 'https://cdn.test/uploads/images/preview.webp?e2e=1';
    const { ciphertext, key } = await sealAttachment(new Blob([new Uint8Array([1, 2, 3])]), { roomId: ROOM_ID, messageId: MESSAGE_ID, slot: 'thumbnail' });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(ciphertext.slice(0)))));

    expect((await decryptMessageView(socket, await encryptedPreviewMessage(imageUrl, key))).linkPreview?.imageUrl).toBeNull();
    clearDecryptedMediaCache();
    expect((await decryptMessageView(socket, await encryptedPreviewMessage(imageUrl))).linkPreview?.imageUrl).toBeNull();
  });
});

describe('hasUnencryptedFields', () => {
  const ENCRYPTED_TEXT = 'e2e:v1:AAAA';
  const AUTHENTICATED_TEXT = 'e2e:v2:AAAA';

  it('flags plaintext text, captions, file details and link previews', () => {
    expect(hasUnencryptedFields(toMessageView({ content: 'olá' }))).toBe(true);
    expect(hasUnencryptedFields(toMessageView({ content: ENCRYPTED_TEXT, caption: 'caption' }))).toBe(true);
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

  it('flags attachment keys that travel in plaintext', () => {
    for (const field of ['key', 'thumbnailKey', 'previewKey']) {
      expect(
        hasUnencryptedFields(
          toMessageView({
            content: 'https://cdn.test/uploads/images/a.png?e2e=1',
            type: 'image',
            fileMeta: { name: ENCRYPTED_TEXT, mimeType: ENCRYPTED_TEXT, size: 1, [field]: 'k'.repeat(43) },
          }),
        ),
      ).toBe(true);
    }
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
    addGeneration(ROOM_ID);
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
  let contentKey: string;

  const fileMeta = (mimeType: string) => ({ name: 'x', mimeType, size: 1, key: contentKey });
  const source = (mimeType: string, messageType: MessageView['type'], messageId = MESSAGE_ID) => ({
    roomId: ROOM_ID,
    messageId,
    fileMeta: fileMeta(mimeType),
    messageType,
  });

  beforeEach(async () => {
    roomKeys.clear();
    addGeneration(ROOM_ID);
    createdBlobs.length = 0;
    const html = new Blob(['<script>alert(1)</script>'], { type: 'text/html' });
    const sealed = await sealAttachment(html, { roomId: ROOM_ID, messageId: MESSAGE_ID, slot: 'content' });
    ciphertext = await sealed.ciphertext.arrayBuffer();
    contentKey = sealed.key;
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
    await decryptMediaContentIfNeeded(MEDIA_URL, source('text/html', 'file'));
    clearDecryptedMediaCache();
    await decryptMediaContentIfNeeded(MEDIA_URL, source('image/svg+xml', 'image'));
    clearDecryptedMediaCache();
    await decryptMediaContentIfNeeded(MEDIA_URL, source('application/pdf', 'image'));

    expect(createdBlobs.map((blob) => blob.type)).toEqual(['application/octet-stream', 'application/octet-stream', 'application/octet-stream']);
  });

  it('keeps passive types that match the message type', async () => {
    await decryptMediaContentIfNeeded(MEDIA_URL, source('image/png', 'image'));
    clearDecryptedMediaCache();
    await decryptMediaContentIfNeeded(MEDIA_URL, source('audio/webm;codecs=opus', 'audio'));
    clearDecryptedMediaCache();
    await decryptMediaContentIfNeeded(MEDIA_URL, source('application/pdf', 'file'));

    expect(createdBlobs.map((blob) => blob.type)).toEqual(['image/png', 'audio/webm', 'application/pdf']);
  });

  it('does not let a second message reusing the url inherit the first message type', async () => {
    const first = await decryptMediaContentIfNeeded(MEDIA_URL, source('text/html', 'file'));
    const second = await decryptMediaContentIfNeeded(MEDIA_URL, source('application/pdf', 'file'));

    expect(first).not.toBe(second);
    expect(createdBlobs.map((blob) => blob.type)).toEqual(['application/octet-stream', 'application/pdf']);
  });

  it('does not let another message reuse a cached object of the first message', async () => {
    const first = await decryptMediaContentIfNeeded(MEDIA_URL, source('application/pdf', 'file'));
    const replayed = await decryptMediaContentIfNeeded(MEDIA_URL, source('application/pdf', 'file', OTHER_MESSAGE_ID));

    expect(first).toMatch(/^blob:/);
    expect(replayed).toBe(MEDIA_URL);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fetch anything when the message carries no attachment key', async () => {
    const withoutKey = { roomId: ROOM_ID, messageId: MESSAGE_ID, fileMeta: { name: 'x', mimeType: 'application/pdf', size: 1 }, messageType: 'file' as const };
    await expect(decryptMediaContentIfNeeded(MEDIA_URL, withoutKey)).resolves.toBe(MEDIA_URL);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never fetches media outside the storage upload paths', async () => {
    const outside = 'https://evil.test/payload.bin?e2e=1';
    await expect(decryptMediaContentIfNeeded(outside, source('image/png', 'image'))).resolves.toBe(outside);
    const insecure = 'http://cdn.test/uploads/images/a.png?e2e=1';
    await expect(decryptMediaContentIfNeeded(insecure, source('image/png', 'image'))).resolves.toBe(insecure);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('authenticated message fields', () => {
  beforeEach(() => {
    roomKeys.clear();
    addGeneration(ROOM_ID);
  });

  async function unavailableText(view: MessageView): Promise<boolean> {
    const decrypted = await decryptMessageView(socket, view);
    return decrypted.content !== 'secret';
  }

  it('generates a unique message id for every message', async () => {
    const first = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'a' });
    const second = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'a' });
    expect(first.messageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.messageId).not.toBe(second.messageId);
  });

  it('opens a message only for the room, sender and id it was sealed for', async () => {
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'secret' });
    const view = viewOf(encrypted);

    expect(await unavailableText(view)).toBe(false);
    expect(await unavailableText({ ...view, id: 'another-message' })).toBe(true);
    expect(await unavailableText({ ...view, roomId: 'room-2' })).toBe(true);
    expect(await unavailableText({ ...view, sender: { ...view.sender, id: 'user-2' } })).toBe(true);
  });

  it('does not accept a field moved to another slot of the same message', async () => {
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'secret', caption: 'caption' });
    const swapped = { ...viewOf(encrypted), content: encrypted.caption };
    expect(await unavailableText(swapped)).toBe(true);
  });

  it('rejects a message whose signature does not come from the claimed sender', async () => {
    const sodium = await getSodium();
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'secret' });
    const view = viewOf(encrypted);
    const forged = { ...view, sender: { ...view.sender, id: 'user-2' } };
    const otherKey = await deriveSigningKeyPair(crypto.getRandomValues(new Uint8Array(32)));
    contactSigningKeys.set('user-2', sodium.to_base64(otherKey.publicKey));

    expect(await unavailableText(forged)).toBe(true);
  });

  it('rejects a field sealed with another key even when the context is right', async () => {
    const sodium = await getSodium();
    const { key: roomKey, keyId } = currentGeneration(ROOM_ID);
    const attacker = await deriveSigningKeyPair(crypto.getRandomValues(new Uint8Array(32)));
    const real = await deriveSigningKeyPair(crypto.getRandomValues(new Uint8Array(32)));
    contactSigningKeys.set('user-2', sodium.to_base64(real.publicKey));
    const forged = await sealAuthenticatedField('secret', roomKey, attacker.privateKey, {
      roomId: ROOM_ID,
      senderId: 'user-2',
      messageId: 'message-1',
      keyId,
      label: 'content',
    });

    const view = toMessageView({ content: forged, sender: { id: 'user-2', nickname: 'bia', avatar: null } });
    expect(await unavailableText(view)).toBe(true);
    contactSigningKeys.set('user-2', sodium.to_base64(attacker.publicKey));
    expect((await decryptMessageView(socket, view)).content).toBe('secret');
  });

  it('rejects a flipped byte, a truncated payload and slot swaps in file and link fields', async () => {
    const sodium = await getSodium();
    const encrypted = await encryptOutgoingMessage({
      roomId: ROOM_ID,
      content: 'secret',
      fileMeta: { name: 'a.txt', mimeType: 'text/plain', size: 1 },
      linkPreview: { url: 'https://site.test', title: 'Site', description: null, imageUrl: null, siteName: 'Site' },
    });
    const view = viewOf(encrypted);
    const fieldPrefix = `e2e:v2:${currentGeneration(ROOM_ID).keyId}:`;
    const raw = sodium.from_base64(encrypted.content.slice(fieldPrefix.length));
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1;
    expect(await unavailableText({ ...view, content: fieldPrefix + sodium.to_base64(raw) })).toBe(true);
    expect(await unavailableText({ ...view, content: fieldPrefix + 'AAAA' })).toBe(true);

    const swappedFile = await decryptMessageView(socket, {
      ...view,
      fileMeta: { name: encrypted.fileMeta?.mimeType ?? '', mimeType: encrypted.fileMeta?.name ?? '', size: 1 },
    });
    expect(swappedFile.fileMeta?.name).not.toBe('text/plain');
    expect(swappedFile.fileMeta?.mimeType).not.toBe('a.txt');
    const swappedLink = await decryptMessageView(socket, {
      ...view,
      linkPreview: { url: encrypted.linkPreview?.title ?? '', title: encrypted.linkPreview?.url ?? '', description: null, imageUrl: null, siteName: null },
    });
    expect(swappedLink.linkPreview?.url).not.toBe('Site');
    expect(swappedLink.linkPreview?.title).not.toBe('https://site.test');
  });

  it('opens the fields of a reply snapshot with the replied message identity', async () => {
    const original = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'secret' });
    const view = toMessageView({
      content: 'e2e:v1:ignored',
      replyTo: {
        id: original.messageId,
        content: original.content,
        type: 'text',
        duration: null,
        fileMeta: null,
        caption: null,
        sender: { id: OWN_ID, nickname: 'ana', avatar: null },
      },
    });
    expect((await decryptMessageView(socket, view)).replyTo?.content).toBe('secret');
    const wrongId = { ...view, replyTo: view.replyTo && { ...view.replyTo, id: 'other-message' } };
    expect((await decryptMessageView(socket, wrongId)).replyTo?.content).not.toBe('secret');
  });

  it('rejects a message from a sender without a known signing key', async () => {
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'secret' });
    const view = viewOf(encrypted);
    setCurrentIdentity({ userId: 'user-9', publicKey: 'unused', privateKey: crypto.getRandomValues(new Uint8Array(32)) });
    expect(await unavailableText(view)).toBe(true);
  });

  it('verifies a message from another member with the pinned signing key', async () => {
    const sodium = await getSodium();
    const senderPrivateKey = crypto.getRandomValues(new Uint8Array(32));
    setCurrentIdentity({ userId: 'user-2', publicKey: 'unused', privateKey: senderPrivateKey });
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'secret' });
    const view = { ...viewOf(encrypted), sender: { id: 'user-2', nickname: 'bia', avatar: null } };

    setCurrentIdentity({ userId: OWN_ID, publicKey: 'unused', privateKey: crypto.getRandomValues(new Uint8Array(32)) });
    contactSigningKeys.set('user-2', sodium.to_base64((await deriveSigningKeyPair(senderPrivateKey)).publicKey));

    expect(await unavailableText(view)).toBe(false);
  });

  it('shows content in the v1 format as unsupported and never decrypts it', async () => {
    const sodium = await getSodium();
    const key = currentGeneration(ROOM_ID).key;
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const sealed = sodium.crypto_secretbox_easy('secret', nonce, key);
    const combined = new Uint8Array(nonce.length + sealed.length);
    combined.set(nonce, 0);
    combined.set(sealed, nonce.length);

    const decrypted = await decryptMessageView(socket, toMessageView({ content: 'e2e:v1:' + sodium.to_base64(combined), caption: 'e2e:v1:abc' }));
    expect(decrypted.content).toBe(translate('chat.message.unsupportedFormat'));
    expect(decrypted.caption).toBe(translate('chat.message.unsupportedFormat'));
    expect(decrypted.unencrypted).toBe(false);
  });

  it('shows v2 fields without a key id as unsupported', async () => {
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'secret' });
    const withoutKeyId = 'e2e:v2:' + encrypted.content.slice(encrypted.content.lastIndexOf(':') + 1);
    const decrypted = await decryptMessageView(socket, { ...viewOf(encrypted), content: withoutKeyId });
    expect(decrypted.content).toBe(translate('chat.message.unsupportedFormat'));
  });
});

describe('room key generations in message fields', () => {
  beforeEach(() => {
    roomKeys.clear();
  });

  it('seals every field with the current generation and names its key id', async () => {
    addGeneration(ROOM_ID);
    const current = addGeneration(ROOM_ID);
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'secret', caption: 'caption' });
    expect(encrypted.content.startsWith(`e2e:v2:${current.keyId}:`)).toBe(true);
    expect(encrypted.caption?.startsWith(`e2e:v2:${current.keyId}:`)).toBe(true);
  });

  it('keeps history readable across generations', async () => {
    addGeneration(ROOM_ID);
    const first = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'before rotation' });
    addGeneration(ROOM_ID);
    const second = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'after rotation' });

    expect((await decryptMessageView(socket, viewOf(first))).content).toBe('before rotation');
    expect((await decryptMessageView(socket, viewOf(second))).content).toBe('after rotation');
  });

  it('binds the key id: a field relabelled with another generation does not open', async () => {
    const first = addGeneration(ROOM_ID);
    const second = addGeneration(ROOM_ID);
    second.key = first.key;
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'secret' });
    const relabelled = encrypted.content.replace(second.keyId, first.keyId);

    expect((await decryptMessageView(socket, viewOf(encrypted))).content).toBe('secret');
    expect((await decryptMessageView(socket, { ...viewOf(encrypted), content: relabelled })).content).toBe(translate('chat.message.encryptedUnavailable'));
  });

  it('shows a field whose generation is unknown as unavailable', async () => {
    addGeneration(ROOM_ID);
    const encrypted = await encryptOutgoingMessage({ roomId: ROOM_ID, content: 'secret' });
    roomKeys.clear();
    addGeneration(ROOM_ID);
    expect((await decryptMessageView(socket, viewOf(encrypted))).content).toBe(translate('chat.message.encryptedUnavailable'));
  });

});

describe('per-attachment keys in messages', () => {
  const MEDIA_URL = 'https://cdn.test/uploads/images/photo.bin?e2e=1';
  const THUMB_URL = 'https://cdn.test/uploads/images/thumb.bin?e2e=1';
  const fetchMock = vi.fn<typeof fetch>();
  let objectUrls = 0;

  beforeEach(() => {
    roomKeys.clear();
    objectUrls = 0;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:https://app.test/${++objectUrls}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clearDecryptedMediaCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function binding(slot: AttachmentBinding['slot'], messageId = MESSAGE_ID): AttachmentBinding {
    return { roomId: ROOM_ID, messageId, slot };
  }

  async function sealedImageMessage(messageId = MESSAGE_ID) {
    const content = await sealAttachment(new Blob([new Uint8Array([7, 7, 7])]), binding('content', messageId));
    const thumbnail = await sealAttachment(new Blob([new Uint8Array([8, 8])]), binding('thumbnail', messageId));
    const objects = new Map([
      [MEDIA_URL, await content.ciphertext.arrayBuffer()],
      [THUMB_URL, await thumbnail.ciphertext.arrayBuffer()],
    ]);
    fetchMock.mockImplementation((input) => Promise.resolve(new Response(objects.get(input as string)?.slice(0) ?? null, { status: 200 })));
    const encrypted = await encryptOutgoingMessage({
      roomId: ROOM_ID,
      type: 'image',
      content: MEDIA_URL,
      messageId,
      fileMeta: { name: 'p.webp', mimeType: 'image/webp', size: 3, thumbnailUrl: THUMB_URL, key: content.key, thumbnailKey: thumbnail.key },
    });
    return { encrypted, contentKey: content.key, thumbnailKey: thumbnail.key };
  }

  it('decrypts the thumbnail and keeps both keys for the deferred original after a room key rotation', async () => {
    addGeneration(ROOM_ID);
    const { encrypted, contentKey, thumbnailKey } = await sealedImageMessage();
    addGeneration(ROOM_ID);

    const view = toMessageView({ id: MESSAGE_ID, type: 'image', content: encrypted.content, fileMeta: encrypted.fileMeta ?? null });
    const decrypted = await decryptMessageView(socket, view);

    expect(decrypted.content).toBe(MEDIA_URL);
    expect(decrypted.fileMeta?.thumbnailUrl).toMatch(/^blob:/);
    expect(decrypted.fileMeta).toMatchObject({ name: 'p.webp', mimeType: 'image/webp', key: contentKey, thumbnailKey });
    expect(decrypted.unencrypted).toBe(false);

    const original = await decryptMediaContentIfNeeded(MEDIA_URL, { roomId: ROOM_ID, messageId: MESSAGE_ID, fileMeta: decrypted.fileMeta, messageType: 'image' });
    expect(original).toMatch(/^blob:/);
  });

  it('ignores keys that were swapped between fields or sent in plaintext', async () => {
    addGeneration(ROOM_ID);
    const { encrypted, contentKey } = await sealedImageMessage();
    const swapped = { ...encrypted.fileMeta, name: 'x', mimeType: 'x', size: 1, key: encrypted.fileMeta?.thumbnailKey, thumbnailKey: encrypted.fileMeta?.key };
    const swappedView = await decryptMessageView(socket, toMessageView({ id: MESSAGE_ID, type: 'image', content: MEDIA_URL, fileMeta: swapped }));
    expect(swappedView.fileMeta?.key).toBeUndefined();
    expect(swappedView.fileMeta?.thumbnailKey).toBeUndefined();

    const plain = { ...encrypted.fileMeta, name: 'x', mimeType: 'x', size: 1, key: contentKey };
    const plainView = await decryptMessageView(socket, toMessageView({ id: MESSAGE_ID, type: 'image', content: MEDIA_URL, fileMeta: plain }));
    expect(plainView.fileMeta?.key).toBeUndefined();
    expect(plainView.unencrypted).toBe(true);
  });

  it('does not open a message whose sealed fields were moved to another message id', async () => {
    addGeneration(ROOM_ID);
    const { encrypted } = await sealedImageMessage();
    const moved = await decryptMessageView(
      socket,
      toMessageView({ id: OTHER_MESSAGE_ID, type: 'image', content: MEDIA_URL, fileMeta: encrypted.fileMeta ?? null }),
    );
    expect(moved.fileMeta?.key).toBeUndefined();
    expect(moved.fileMeta?.thumbnailUrl).toBe(THUMB_URL);
  });

  it('does not decrypt the old room key attachment format', async () => {
    const sodium = await getSodium();
    const { key, keyId } = addGeneration(ROOM_ID);
    const keyIdBytes = sodium.from_base64(keyId, sodium.base64_variants.URLSAFE_NO_PADDING);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const sealed = sodium.crypto_secretbox_easy(new Uint8Array(64), nonce, key);
    const legacy = new Uint8Array([...keyIdBytes, ...nonce, ...sealed]);
    fetchMock.mockResolvedValue(new Response(legacy));

    const roomKeyAsFileKey = sodium.to_base64(key, sodium.base64_variants.URLSAFE_NO_PADDING);
    const resolved = await decryptMediaContentIfNeeded(MEDIA_URL, {
      roomId: ROOM_ID,
      messageId: MESSAGE_ID,
      fileMeta: { name: 'p', mimeType: 'image/webp', size: 3, key: roomKeyAsFileKey },
      messageType: 'image',
    });

    expect(resolved).toBe(MEDIA_URL);
  });
});

describe('decryptMediaContentIfNeeded for gifs', () => {
  const GIF_URL = 'https://cdn.test/uploads/gifs/payload.bin?e2e=1';
  const createdBlobs: Blob[] = [];
  const fetchMock = vi.fn<typeof fetch>();
  const original = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 9, 9]);
  let ciphertext: ArrayBuffer;
  let contentKey: string;

  const gifSource = (mimeType: string, messageType: MessageView['type'] = 'image') => ({
    roomId: ROOM_ID,
    messageId: MESSAGE_ID,
    fileMeta: { name: 'gif.webp', mimeType, size: original.byteLength, key: contentKey },
    messageType,
  });

  beforeEach(async () => {
    createdBlobs.length = 0;
    const padded = await padGif(new Blob([original], { type: 'image/webp' }));
    const sealed = await sealAttachment(padded, { roomId: ROOM_ID, messageId: MESSAGE_ID, slot: 'content' });
    ciphertext = await sealed.ciphertext.arrayBuffer();
    contentKey = sealed.key;
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

  it('removes the padding of a marked gif and keeps only the raster essence as type', async () => {
    const resolved = await decryptMediaContentIfNeeded(GIF_URL, gifSource('image/webp; sparkchat-gif=1'));

    expect(resolved).toBe('blob:https://app.test/1');
    expect(createdBlobs[0]?.type).toBe('image/webp');
    expect(new Uint8Array(await (createdBlobs[0] as Blob).arrayBuffer())).toEqual(original);
  });

  it('keeps the padded bytes for an unmarked image so older clients still display it', async () => {
    await decryptMediaContentIfNeeded(GIF_URL, gifSource('image/webp'));

    expect(createdBlobs[0]?.type).toBe('image/webp');
    expect(createdBlobs[0]?.size).toBe(256 * 1024);
  });

  it('does not create media when the padding is invalid', async () => {
    const unpadded = await sealAttachment(new Blob([original]), { roomId: ROOM_ID, messageId: MESSAGE_ID, slot: 'content' });
    contentKey = unpadded.key;
    const unpaddedCiphertext = await unpadded.ciphertext.arrayBuffer();
    fetchMock.mockImplementation(() => Promise.resolve(new Response(unpaddedCiphertext.slice(0))));

    await expect(decryptMediaContentIfNeeded(GIF_URL, gifSource('image/webp; sparkchat-gif=1'))).resolves.toBe(GIF_URL);
    expect(createdBlobs).toHaveLength(0);
  });

  it.each([404, 403])('marks a gif whose download returns %i as expired', async (status) => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status })));

    await expect(decryptMediaContentIfNeeded(GIF_URL, gifSource('image/webp; sparkchat-gif=1'))).resolves.toBe(GIF_URL);
    expect(isExpiredMediaUrl(GIF_URL)).toBe(true);

    clearDecryptedMediaCache();
    expect(isExpiredMediaUrl(GIF_URL)).toBe(false);
  });

  it('does not mark other failures or non gif media as expired', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 500 })));
    await decryptMediaContentIfNeeded(GIF_URL, gifSource('image/webp; sparkchat-gif=1'));
    expect(isExpiredMediaUrl(GIF_URL)).toBe(false);

    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 404 })));
    await decryptMediaContentIfNeeded(GIF_URL, gifSource('image/webp'));
    expect(isExpiredMediaUrl(GIF_URL)).toBe(false);
  });
});
