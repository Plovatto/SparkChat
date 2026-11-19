import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openAttachment } from '@lib/e2ee/attachment-crypto';
import { unpadGif } from '@lib/media/gif-padding';
import { isGifMimeType } from '@lib/media/media-type';
import { uploadChatGif } from './chat-api';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test' } }));
vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key, hasTranslation: () => false }));
vi.mock('@lib/e2ee', async () => ({ sealAttachment: (await import('@lib/e2ee/attachment-crypto')).sealAttachment }));

const KIB = 1024;
const auth = { userId: 'user-1', sessionToken: 'token' };
const TARGET = { roomId: 'room-1', messageId: '11111111-1111-4111-8111-111111111111' };

interface CapturedUpload {
  url: string;
  fields: [string, FormDataEntryValue][];
}

let uploads: CapturedUpload[] = [];

function webpOfSize(size: number): Blob {
  const bytes = new Uint8Array(size).fill(9);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  return new Blob([bytes], { type: 'image/webp' });
}

beforeEach(() => {
  uploads = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    uploads.push({ url, fields: [...(init.body as FormData).entries()] });
    return Promise.resolve(Response.json({ url: 'https://cdn.test/uploads/gifs/a.bin?e2e=1' }, { status: 201 }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function uploadedFile(): File {
  return uploads[0]?.fields[1]?.[1] as File;
}

describe('uploadChatGif', () => {
  it('uploads neutral ciphertext of exactly a bucket plus 40 bytes to the gif endpoint', async () => {
    await uploadChatGif(webpOfSize(120 * KIB), auth, TARGET);

    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.url).toBe('https://api.test/api/messages/upload/gif');
    expect(uploads[0]?.fields.map(([name]) => name)).toEqual(['encrypted', 'gif']);
    expect(uploads[0]?.fields[0]?.[1]).toBe('1');
    expect(uploadedFile().name).toBe('blob.bin');
    expect(uploadedFile().type).toBe('application/octet-stream');
    expect(uploadedFile().size).toBe(256 * KIB + 40);
  });

  it('gives gifs of different sizes inside a bucket the same ciphertext size', async () => {
    await uploadChatGif(webpOfSize(10 * KIB), auth, TARGET);
    await uploadChatGif(webpOfSize(200 * KIB), auth, TARGET);
    await uploadChatGif(webpOfSize(700 * KIB), auth, TARGET);

    expect(uploads.map((upload) => (upload.fields[1]?.[1] as File).size)).toEqual([256 * KIB + 40, 256 * KIB + 40, 1024 * KIB + 40]);
  });

  it('returns the marked type, original size and a key that opens the padded media', async () => {
    const original = webpOfSize(3000);

    const uploaded = await uploadChatGif(original, auth, TARGET);

    expect(uploaded).toMatchObject({
      url: 'https://cdn.test/uploads/gifs/a.bin?e2e=1',
      name: 'gif.webp',
      mimeType: 'image/webp; sparkchat-gif=1',
      size: 3000,
    });
    expect(isGifMimeType(uploaded.mimeType)).toBe(true);
    const opened = await openAttachment(await uploadedFile().arrayBuffer(), uploaded.key, { ...TARGET, slot: 'content' }, 'image/webp');
    const restored = unpadGif(new Uint8Array(await (opened as Blob).arrayBuffer()), 'image/webp');
    expect(new Uint8Array(await (restored as Blob).arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()));
  });

  it('names gif media as a gif', async () => {
    const uploaded = await uploadChatGif(new Blob(['GIF89a'], { type: 'image/gif' }), auth, TARGET);

    expect(uploaded.name).toBe('gif.gif');
    expect(uploaded.mimeType).toBe('image/gif; sparkchat-gif=1');
  });

  it('refuses non gif media and oversized gifs without uploading', async () => {
    await expect(uploadChatGif(new Blob(['<svg/>'], { type: 'image/svg+xml' }), auth, TARGET)).rejects.toMatchObject({
      payload: { code: 'upload.invalidType', params: { kind: 'gif' } },
    });
    await expect(uploadChatGif(webpOfSize(2048 * KIB), auth, TARGET)).rejects.toMatchObject({
      payload: { code: 'upload.invalidGifSize' },
      fallbackKey: 'chat.upload.gifFailed',
    });
    expect(uploads).toHaveLength(0);
  });

  it('surfaces the server error when the gif upload is refused', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ code: 'rateLimit.gifUpload' }, { status: 429 })));

    await expect(uploadChatGif(webpOfSize(100), auth, TARGET)).rejects.toMatchObject({ payload: { code: 'rateLimit.gifUpload' } });
  });
});
