import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@lib/socket';
import type { ChatMessage } from '../types';
import { forwardMessage } from './forward-message';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test' } }));
vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key, hasTranslation: () => false }));
vi.mock('@lib/media/image-compression', () => ({
  buildImageVariants: (file: File) => Promise.resolve({ original: file, thumbnail: new Blob(['thumb'], { type: 'image/webp' }) }),
}));
vi.mock('@lib/e2ee', () => {
  return {
    ensureRoomKeyForSending: () => Promise.resolve({ keyId: 'k'.repeat(22), epoch: 1, key: new Uint8Array(32) }),
    isEncryptedMediaUrl: (url: string) => url.includes('e2e=1'),
    decryptMediaContentIfNeeded: (_socket: unknown, content: string) => Promise.resolve(content.replace('https://cdn.test/', 'blob:').replace('?e2e=1', '')),
    encryptAttachment: async (_roomId: string, blob: Blob) => new Blob([new Uint8Array(24), await blob.arrayBuffer()], { type: 'application/octet-stream' }),
  };
});

interface CapturedUpload {
  url: string;
  file: File;
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
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (url.startsWith('blob:')) {
      return Promise.resolve(new Response(new Blob([`plain ${url}`])));
    }
    const body = init?.body as FormData;
    const file = [...body.values()].find((value): value is File => value instanceof File);
    uploads.push({ url, file: file as File });
    return Promise.resolve(
      Response.json({ url: `https://cdn.test/uploads/new/${uploads.length}.bin?e2e=1`, name: 'leak.exe', mimeType: 'text/html' }, { status: 201 }),
    );
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

describe('forwardMessage', () => {
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

  it('forwards text without uploading anything', async () => {
    await forwardMessage(createSocket(), { userId: 'u', sessionToken: 't' }, buildMessage({ type: 'text', content: 'oi' }), 'target-room');

    expect(uploads).toHaveLength(0);
    expect(sent[0]).toMatchObject({ type: 'text', content: 'oi', roomId: 'target-room' });
  });
});
