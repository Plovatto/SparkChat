import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@lib/api/api-error';
import { uploadChatAudio, uploadChatFile, uploadChatImage, uploadLinkPreviewImage } from './chat-api';

const variants = vi.hoisted(() => ({ original: null as Blob | null, thumbnail: null as Blob | null, decodable: true }));

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test' } }));
vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key, hasTranslation: () => false }));
const sealed = vi.hoisted(() => [] as { roomId: string; messageId: string; slot: string }[]);

vi.mock('@lib/e2ee', () => ({
  sealAttachment: async (blob: Blob, binding: { roomId: string; messageId: string; slot: string }) => {
    sealed.push(binding);
    return {
      ciphertext: new Blob([new Uint8Array(24), await blob.arrayBuffer()], { type: 'application/octet-stream' }),
      key: `key-${binding.slot}-${sealed.length}`,
    };
  },
}));
vi.mock('@lib/media/image-compression', () => ({
  buildImageVariants: (file: File) => Promise.resolve({ original: variants.original ?? file, thumbnail: variants.thumbnail }),
  canDecodeImage: () => Promise.resolve(variants.decodable),
}));

const auth = { userId: 'user-1', sessionToken: 'token' };
const TARGET = { roomId: 'room-1', messageId: '11111111-1111-4111-8111-111111111111' };

interface CapturedUpload {
  url: string;
  fields: [string, FormDataEntryValue][];
}

let uploads: CapturedUpload[] = [];
let nextResponse: (index: number) => Response = (index) => Response.json({ url: `https://cdn.test/uploads/x/${index}.bin?e2e=1` }, { status: 201 });

beforeEach(() => {
  uploads = [];
  sealed.length = 0;
  variants.original = null;
  variants.thumbnail = null;
  variants.decodable = true;
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

    const uploaded = await uploadChatFile(file, auth, TARGET);

    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.url).toBe('https://api.test/api/messages/upload-file');
    expectNeutralUpload(uploads[0], 'file');
    expect(uploaded).toEqual({
      url: 'https://cdn.test/uploads/x/0.bin?e2e=1',
      key: 'key-content-1',
      name: 'relatório secreto.pdf',
      mimeType: 'application/pdf',
      size: file.size,
    });
    expect(sealed).toEqual([{ ...TARGET, slot: 'content' }]);
  });

  it('sends plain text files the same way', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    const uploaded = await uploadChatFile(file, auth, TARGET);

    expectNeutralUpload(uploads[0], 'file');
    expect(uploaded).toMatchObject({ name: 'notes.txt', mimeType: 'text/plain' });
  });

  it('sends an image and its thumbnail as neutral ciphertext and reports the local type', async () => {
    variants.original = new Blob(['compressed'], { type: 'image/webp' });
    variants.thumbnail = new Blob(['thumb'], { type: 'image/webp' });
    const file = new File(['big png'], 'vacation.png', { type: 'image/png' });

    const uploaded = await uploadChatImage(file, auth, TARGET);

    expect(uploads).toHaveLength(2);
    for (const upload of uploads) {
      expect(upload.url).toBe('https://api.test/api/messages/upload-image');
      expectNeutralUpload(upload, 'image');
    }
    expect(uploaded).toEqual({
      url: 'https://cdn.test/uploads/x/0.bin?e2e=1',
      key: expect.stringMatching(/^key-content-/) as unknown,
      mimeType: 'image/webp',
      thumbnailUrl: 'https://cdn.test/uploads/x/1.bin?e2e=1',
      thumbnailKey: expect.stringMatching(/^key-thumbnail-/) as unknown,
    });
    expect(sealed).toEqual(expect.arrayContaining([{ ...TARGET, slot: 'content' }, { ...TARGET, slot: 'thumbnail' }]));
    expect(uploaded.key).not.toBe(uploaded.thumbnailKey);
  });

  it('sends recorded audio as neutral ciphertext and keeps the recorder type', async () => {
    const uploaded = await uploadChatAudio(new Blob(['voice']), 'audio/webm;codecs=opus', auth, TARGET);

    expect(uploads[0]?.url).toBe('https://api.test/api/messages/upload-audio');
    expectNeutralUpload(uploads[0], 'audio');
    expect(uploaded).toEqual({ url: 'https://cdn.test/uploads/x/0.bin?e2e=1', key: 'key-content-1', mimeType: 'audio/webm;codecs=opus' });
  });

  it('seals a link preview image in the preview slot of its message', async () => {
    const uploaded = await uploadLinkPreviewImage(new Blob(['img'], { type: 'image/webp' }), auth, TARGET);

    expectNeutralUpload(uploads[0], 'image');
    expect(sealed).toEqual([{ ...TARGET, slot: 'preview' }]);
    expect(uploaded).toEqual({ url: 'https://cdn.test/uploads/x/0.bin?e2e=1', key: 'key-preview-1' });
  });

  it('refuses file types the server never accepted without uploading anything', async () => {
    await expect(uploadChatFile(new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' }), auth, TARGET)).rejects.toMatchObject({
      payload: { code: 'upload.invalidType', params: { kind: 'file' } },
    });
    await expect(uploadChatFile(new File(['x'], 'fake.exe', { type: 'application/pdf' }), auth, TARGET)).rejects.toBeInstanceOf(ApiError);
    await expect(uploadChatImage(new File(['x'], 'vector.svg', { type: 'image/svg+xml' }), auth, TARGET)).rejects.toMatchObject({
      payload: { code: 'upload.invalidType', params: { kind: 'image' } },
    });
    await expect(uploadChatAudio(new Blob(['x']), 'video/x-flv', auth, TARGET)).rejects.toMatchObject({
      payload: { code: 'upload.invalidType', params: { kind: 'audio' } },
    });
    expect(uploads).toHaveLength(0);
  });

  it('refuses an image the browser cannot decode without uploading anything', async () => {
    variants.decodable = false;

    await expect(uploadChatImage(new File(['just text'], 'fake.jpg', { type: 'image/jpeg' }), auth, TARGET)).rejects.toMatchObject({
      fallbackKey: 'chat.upload.imageUnreadable',
    });
    expect(uploads).toHaveLength(0);
    expect(sealed).toHaveLength(0);
  });

  it('still sends a decodable image when only the thumbnail could not be built', async () => {
    const uploaded = await uploadChatImage(new File(['png'], 'photo.png', { type: 'image/png' }), auth, TARGET);

    expect(uploads).toHaveLength(1);
    expect(uploaded.thumbnailUrl).toBeUndefined();
  });

  it('refuses attachments over the server limits before encrypting them', async () => {
    const oversized = (bytes: number) => new Uint8Array(bytes);
    await expect(uploadChatFile(new File([oversized(50 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' }), auth, TARGET)).rejects.toMatchObject({
      payload: { code: 'upload.tooLarge', params: { kind: 'file', maxSize: '50MB' } },
    });
    variants.thumbnail = new Blob(['thumb'], { type: 'image/webp' });
    await expect(uploadChatImage(new File([oversized(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }), auth, TARGET)).rejects.toMatchObject({
      payload: { code: 'upload.tooLarge', params: { kind: 'image', maxSize: '5MB' } },
    });
    await expect(uploadChatAudio(new Blob([oversized(8 * 1024 * 1024 + 1)]), 'audio/webm', auth, TARGET)).rejects.toMatchObject({
      payload: { code: 'upload.tooLarge', params: { kind: 'audio', maxSize: '8MB' } },
    });
    expect(uploads).toHaveLength(0);
    expect(sealed).toHaveLength(0);
  });

  it('accepts an image whose compressed version fits the limit', async () => {
    variants.original = new Blob(['small'], { type: 'image/webp' });
    variants.thumbnail = new Blob(['thumb'], { type: 'image/webp' });

    await uploadChatImage(new File([new Uint8Array(6 * 1024 * 1024)], 'huge.png', { type: 'image/png' }), auth, TARGET);

    expect(uploads).toHaveLength(2);
  });

  it('surfaces the server error payload when the upload fails', async () => {
    nextResponse = () => Response.json({ code: 'upload.userQuotaExceeded', message: 'quota' }, { status: 507 });

    await expect(uploadChatFile(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }), auth, TARGET)).rejects.toMatchObject({
      payload: { code: 'upload.userQuotaExceeded' },
      fallbackKey: 'chat.upload.fileFailed',
    });
  });

  it('rejects a response without a url', async () => {
    nextResponse = () => Response.json({ name: 'x' }, { status: 201 });

    await expect(uploadChatAudio(new Blob(['voice']), 'audio/ogg', auth, TARGET)).rejects.toBeInstanceOf(ApiError);
  });
});
