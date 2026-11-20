import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as attachmentCrypto from '@lib/e2ee/attachment-crypto';
import { openAttachment } from '@lib/e2ee/attachment-crypto';
import type { AppSocket, MessageFileMeta } from '@lib/socket';
import type { ChatMessage } from '../types';
import { forwardMessage } from './forward-message';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test' } }));
vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key, hasTranslation: () => false }));
vi.mock('@lib/media/image-compression', () => ({
  buildImageVariants: (file: File) => Promise.resolve({ original: file, thumbnail: new Blob(['thumb'], { type: 'image/webp' }) }),
}));
const decryptSources = vi.hoisted(() => [] as { roomId: string; messageId: string; fileMeta: unknown }[]);

vi.mock('@lib/e2ee', async () => {
  const attachments = await vi.importActual<typeof attachmentCrypto>('@lib/e2ee/attachment-crypto');
  return {
    ensureRoomKeyForSending: () => Promise.resolve({ keyId: 'k'.repeat(22), epoch: 1, key: new Uint8Array(32) }),
    isEncryptedMediaUrl: (url: string) => url.includes('e2e=1'),
    decryptMediaContentIfNeeded: (content: string, source: { roomId: string; messageId: string; fileMeta: unknown }) => {
      decryptSources.push(source);
      return Promise.resolve(content.replace('https://cdn.test/', 'blob:').replace('?e2e=1', ''));
    },
    sealAttachment: attachments.sealAttachment,
  };
});

interface CapturedUpload {
  url: string;
  file: File;
  publishedUrl: string;
}

let uploads: CapturedUpload[] = [];
let sent: Record<string, unknown>[] = [];

function createSocket(): AppSocket {
  const handlers = new Map<string, ((payload: unknown) => void)[]>();
  return {
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    off: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, (handlers.get(event) ?? []).filter((candidate) => candidate !== handler));
    },
    emit: (event: string, payload: Record<string, unknown>) => {
      sent.push(payload);
      queueMicrotask(() => {
        for (const handler of handlers.get('message:new') ?? []) {
          handler({ clientTempId: payload.clientTempId });
        }
      });
      return event;
    },
  } as unknown as AppSocket;
}

function buildMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    roomId: 'source-room',
    content: 'https://cdn.test/uploads/files/abc.bin?e2e=1',
    type: 'file',
    fileMeta: null,
    caption: null,
    duration: null,
    ...overrides,
  } as ChatMessage;
}

beforeEach(() => {
  uploads = [];
  sent = [];
  decryptSources.length = 0;
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (url.startsWith('blob:')) {
      return Promise.resolve(new Response(new Blob([`plain ${url}`])));
    }
    const body = init?.body as FormData;
    const file = [...body.values()].find((value): value is File => value instanceof File);
    const publishedUrl = `https://cdn.test/uploads/new/${uploads.length + 1}.bin?e2e=1`;
    uploads.push({ url, file: file as File, publishedUrl });
    return Promise.resolve(Response.json({ url: publishedUrl, name: 'leak.exe', mimeType: 'text/html' }, { status: 201 }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function expectOnlyNeutralUploads(): void {
  expect(uploads.length).toBeGreaterThan(0);
  for (const upload of uploads) {
    expect(upload.file.name).toBe('blob.bin');
    expect(upload.file.type).toBe('application/octet-stream');
  }
}

async function openUploaded(publishedUrl: unknown, key: string | undefined, roomId: string, messageId: unknown, slot: 'content' | 'thumbnail') {
  const upload = uploads.find((candidate) => candidate.publishedUrl === publishedUrl);
  if (!upload || !key || typeof messageId !== 'string') {
    return null;
  }
  return openAttachment(await upload.file.arrayBuffer(), key, { roomId, messageId, slot }, 'application/octet-stream');
}

describe('forwardMessage', () => {
  it('decrypts with the original binding and re-encrypts under new keys bound to a new message id', async () => {
    const originalKey = 'o'.repeat(43);
    const message = buildMessage({ id: 'original-id', fileMeta: { name: 'contrato.pdf', mimeType: 'application/pdf', size: 10, key: originalKey } });

    await forwardMessage(createSocket(), { userId: 'u', sessionToken: 't' }, message, 'target-room');

    expect(decryptSources[0]).toMatchObject({ roomId: 'source-room', messageId: 'original-id' });
    const payload = sent[0] as { messageId: string; content: string; fileMeta: MessageFileMeta };
    expect(payload.messageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.messageId).not.toBe('original-id');
    expect(payload.fileMeta.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(payload.fileMeta.key).not.toBe(originalKey);

    const opened = await openUploaded(payload.content, payload.fileMeta.key, 'target-room', payload.messageId, 'content');
    expect(await opened?.text()).toBe('plain blob:uploads/files/abc.bin');
    await expect(openUploaded(payload.content, payload.fileMeta.key, 'source-room', payload.messageId, 'content')).resolves.toBeNull();
    await expect(openUploaded(payload.content, payload.fileMeta.key, 'target-room', 'original-id', 'content')).resolves.toBeNull();
  });

  it('gives a forwarded image and its thumbnail separate keys in their own slots', async () => {
    const message = buildMessage({ type: 'image', content: 'https://cdn.test/uploads/images/pic.bin?e2e=1', fileMeta: { name: 'f.png', mimeType: 'image/png', size: 10 } });

    await forwardMessage(createSocket(), { userId: 'u', sessionToken: 't' }, message, 'target-room');

    const payload = sent[0] as { messageId: string; content: string; fileMeta: MessageFileMeta };
    expect(payload.fileMeta.key).not.toBe(payload.fileMeta.thumbnailKey);
    expect(await openUploaded(payload.content, payload.fileMeta.key, 'target-room', payload.messageId, 'content')).not.toBeNull();
    expect(await openUploaded(payload.fileMeta.thumbnailUrl, payload.fileMeta.thumbnailKey, 'target-room', payload.messageId, 'thumbnail')).not.toBeNull();
    expect(await openUploaded(payload.fileMeta.thumbnailUrl, payload.fileMeta.thumbnailKey, 'target-room', payload.messageId, 'content')).toBeNull();
  });

  it('re-uploads a pdf as neutral ciphertext and keeps the decrypted name and type in fileMeta', async () => {
    const message = buildMessage({ fileMeta: { name: 'contrato.pdf', mimeType: 'application/pdf', size: 10 } });

    await forwardMessage(createSocket(), { userId: 'u', sessionToken: 't' }, message, 'target-room');

    expectOnlyNeutralUploads();
    expect(uploads[0]?.url).toBe('https://api.test/api/messages/upload-file');
    expect(sent[0]).toMatchObject({
      roomId: 'target-room',
      type: 'file',
      content: 'https://cdn.test/uploads/new/1.bin?e2e=1',
      fileMeta: { name: 'contrato.pdf', mimeType: 'application/pdf' },
    });
  });

  it('re-uploads a text file without taking its name from the server', async () => {
    const message = buildMessage({ fileMeta: { name: 'notas.txt', mimeType: 'text/plain', size: 5 } });

    await forwardMessage(createSocket(), { userId: 'u', sessionToken: 't' }, message, 'target-room');

    expectOnlyNeutralUploads();
    expect(sent[0]).toMatchObject({ fileMeta: { name: 'notas.txt', mimeType: 'text/plain' } });
  });

  it('re-uploads an image and its thumbnail as neutral ciphertext', async () => {
    const message = buildMessage({
      type: 'image',
      content: 'https://cdn.test/uploads/images/pic.bin?e2e=1',
      fileMeta: { name: 'foto.png', mimeType: 'image/png', size: 10 },
    });

    await forwardMessage(createSocket(), { userId: 'u', sessionToken: 't' }, message, 'target-room');

    expectOnlyNeutralUploads();
    expect(uploads).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      type: 'image',
      content: expect.stringMatching(/^https:\/\/cdn\.test\/uploads\/new\/\d\.bin\?e2e=1$/) as unknown,
      fileMeta: { name: 'foto.png', mimeType: 'image/png', thumbnailUrl: expect.stringMatching(/\.bin\?e2e=1$/) as unknown },
    });
  });

  it('re-uploads an audio message keeping its recorded type and duration', async () => {
    const message = buildMessage({
      type: 'audio',
      content: 'https://cdn.test/uploads/audio/voice.bin?e2e=1',
      duration: 4,
      fileMeta: { name: 'audio-1', mimeType: 'audio/ogg;codecs=opus', size: 10 },
    });

    await forwardMessage(createSocket(), { userId: 'u', sessionToken: 't' }, message, 'target-room');

    expectOnlyNeutralUploads();
    expect(uploads[0]?.url).toBe('https://api.test/api/messages/upload-audio');
    expect(sent[0]).toMatchObject({ type: 'audio', duration: 4, fileMeta: { name: 'audio-1', mimeType: 'audio/ogg;codecs=opus' } });
  });

  it('re-uploads a forwarded gif padded to the gif endpoint without recompressing it', async () => {
    const message = buildMessage({
      type: 'image',
      content: 'https://cdn.test/uploads/gifs/cat.bin?e2e=1',
      fileMeta: { name: 'gif.webp', mimeType: 'image/webp; sparkchat-gif=1', size: 262144 },
    });

    await forwardMessage(createSocket(), { userId: 'u', sessionToken: 't' }, message, 'target-room');

    expectOnlyNeutralUploads();
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.url).toBe('https://api.test/api/messages/upload/gif');
    expect(uploads[0]?.file.size).toBe(262144 + 40);
    const payload = sent[0] as { messageId: string; content: string; fileMeta: MessageFileMeta };
    expect(payload).toMatchObject({ type: 'image', fileMeta: { name: 'gif.webp', mimeType: 'image/webp; sparkchat-gif=1', size: 262144 } });
    expect(payload.fileMeta.thumbnailUrl).toBeUndefined();
    const opened = await openUploaded(payload.content, payload.fileMeta.key, 'target-room', payload.messageId, 'content');
    const padded = new Uint8Array(await (opened as Blob).arrayBuffer());
    expect(padded.byteLength).toBe(262144);
    expect(new TextDecoder().decode(padded.subarray(0, 31))).toBe('plain blob:uploads/gifs/cat.bin');
  });

  it('forwards text without uploading anything', async () => {
    await forwardMessage(createSocket(), { userId: 'u', sessionToken: 't' }, buildMessage({ type: 'text', content: 'oi' }), 'target-room');

    expect(uploads).toHaveLength(0);
    expect(sent[0]).toMatchObject({ type: 'text', content: 'oi', roomId: 'target-room' });
  });
});
