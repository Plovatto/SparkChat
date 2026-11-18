import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@lib/api/api-error';
import { uploadChatAudio, uploadChatFile, uploadChatImage } from './chat-api';

const variants = vi.hoisted(() => ({ original: null as Blob | null, thumbnail: null as Blob | null }));

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test' } }));
vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key, hasTranslation: () => false }));
vi.mock('@lib/e2ee', () => ({
  encryptAttachment: async (_roomId: string, blob: Blob) => new Blob([new Uint8Array(24), await blob.arrayBuffer()], { type: 'application/octet-stream' }),
}));
vi.mock('@lib/media/image-compression', () => ({
  buildImageVariants: (file: File) => Promise.resolve({ original: variants.original ?? file, thumbnail: variants.thumbnail }),
}));

const auth = { userId: 'user-1', sessionToken: 'token' };

interface CapturedUpload {
  url: string;
  fields: [string, FormDataEntryValue][];
}

let uploads: CapturedUpload[] = [];
let nextResponse: (index: number) => Response = (index) => Response.json({ url: `https://cdn.test/uploads/x/${index}.bin?e2e=1` }, { status: 201 });

beforeEach(() => {
  uploads = [];
  variants.original = null;
  variants.thumbnail = null;
  nextResponse = (index) =>
    Response.json(
      { url: `https://cdn.test/uploads/x/${index}.bin?e2e=1`, name: 'server-name.exe', mimeType: 'text/html' },
      { status: 201 },
    );
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    const body = init.body as FormData;
    uploads.push({ url, fields: [...body.entries()] });
    return Promise.resolve(nextResponse(uploads.length - 1));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function expectNeutralUpload(upload: CapturedUpload | undefined, field: string): void {
  expect(upload?.fields.map(([name]) => name)).toEqual(['encrypted', field]);
  expect(upload?.fields[0]?.[1]).toBe('1');
  const file = upload?.fields[1]?.[1] as File;
  expect(file.name).toBe('blob.bin');
  expect(file.type).toBe('application/octet-stream');
}

describe('chat attachment uploads', () => {
  it('sends a file as neutral ciphertext and keeps its real name and type local', async () => {
    const file = new File(['%PDF-1.4'], 'relatório secreto.pdf', { type: 'application/pdf' });

    const uploaded = await uploadChatFile(file, auth, 'room-1');

    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.url).toBe('https://api.test/api/messages/upload-file');
    expectNeutralUpload(uploads[0], 'file');
    expect(uploaded).toEqual({ url: 'https://cdn.test/uploads/x/0.bin?e2e=1', name: 'relatório secreto.pdf', mimeType: 'application/pdf', size: file.size });
  });

  it('sends plain text files the same way', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    const uploaded = await uploadChatFile(file, auth, 'room-1');

    expectNeutralUpload(uploads[0], 'file');
    expect(uploaded).toMatchObject({ name: 'notes.txt', mimeType: 'text/plain' });
  });

  it('sends an image and its thumbnail as neutral ciphertext and reports the local type', async () => {
    variants.original = new Blob(['compressed'], { type: 'image/webp' });
    variants.thumbnail = new Blob(['thumb'], { type: 'image/webp' });
    const file = new File(['big png'], 'vacation.png', { type: 'image/png' });

    const uploaded = await uploadChatImage(file, auth, 'room-1');

    expect(uploads).toHaveLength(2);
    for (const upload of uploads) {
      expect(upload.url).toBe('https://api.test/api/messages/upload-image');
      expectNeutralUpload(upload, 'image');
    }
    expect(uploaded).toEqual({
      url: 'https://cdn.test/uploads/x/0.bin?e2e=1',
      mimeType: 'image/webp',
      thumbnailUrl: 'https://cdn.test/uploads/x/1.bin?e2e=1',
    });
  });

  it('sends recorded audio as neutral ciphertext and keeps the recorder type', async () => {
    const uploaded = await uploadChatAudio(new Blob(['voice']), 'audio/webm;codecs=opus', auth, 'room-1');

    expect(uploads[0]?.url).toBe('https://api.test/api/messages/upload-audio');
    expectNeutralUpload(uploads[0], 'audio');
    expect(uploaded).toEqual({ url: 'https://cdn.test/uploads/x/0.bin?e2e=1', mimeType: 'audio/webm;codecs=opus' });
  });

  it('refuses file types the server never accepted without uploading anything', async () => {
    await expect(uploadChatFile(new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' }), auth, 'room-1')).rejects.toMatchObject({
      payload: { code: 'upload.invalidType', params: { kind: 'file' } },
    });
    await expect(uploadChatFile(new File(['x'], 'fake.exe', { type: 'application/pdf' }), auth, 'room-1')).rejects.toBeInstanceOf(ApiError);
    await expect(uploadChatImage(new File(['x'], 'vector.svg', { type: 'image/svg+xml' }), auth, 'room-1')).rejects.toMatchObject({
      payload: { code: 'upload.invalidType', params: { kind: 'image' } },
    });
    await expect(uploadChatAudio(new Blob(['x']), 'video/x-flv', auth, 'room-1')).rejects.toMatchObject({
      payload: { code: 'upload.invalidType', params: { kind: 'audio' } },
    });
    expect(uploads).toHaveLength(0);
  });

  it('surfaces the server error payload when the upload fails', async () => {
    nextResponse = () => Response.json({ code: 'upload.userQuotaExceeded', message: 'quota' }, { status: 507 });

    await expect(uploadChatFile(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }), auth, 'room-1')).rejects.toMatchObject({
      payload: { code: 'upload.userQuotaExceeded' },
      fallbackKey: 'chat.upload.fileFailed',
    });
  });

  it('rejects a response without a url', async () => {
    nextResponse = () => Response.json({ name: 'x' }, { status: 201 });

    await expect(uploadChatAudio(new Blob(['voice']), 'audio/ogg', auth, 'room-1')).rejects.toBeInstanceOf(ApiError);
  });
});
