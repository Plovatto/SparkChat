import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_INPUT_BYTES,
  PROFILE_PHOTO_SIZE,
  ProfilePhotoError,
  compressProfilePhoto,
  profilePhotoErrorKey,
} from './profile-photo-compression';

type Encoder = (type: string, quality: number) => Blob | null;

interface FakeCanvas {
  width: number;
  height: number;
  getContext: () => unknown;
  toBlob: (callback: (blob: Blob | null) => void, type: string, quality: number) => void;
}

const encodeCalls: { type: string; quality: number }[] = [];
const drawCalls: unknown[][] = [];
const fillCalls: unknown[][] = [];
let encoder: Encoder;
let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };

function blobOfSize(size: number, type: string): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

function installCanvas(): void {
  vi.stubGlobal('document', {
    createElement: (tag: string): FakeCanvas => {
      expect(tag).toBe('canvas');
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
          fillRect: (...args: unknown[]) => fillCalls.push(args),
          drawImage: (...args: unknown[]) => drawCalls.push(args),
        }),
        toBlob: (callback, type, quality) => {
          encodeCalls.push({ type, quality });
          callback(encoder(type, quality));
        },
      };
    },
  });
}

beforeEach(() => {
  encodeCalls.length = 0;
  drawCalls.length = 0;
  fillCalls.length = 0;
  bitmap = { width: 1200, height: 800, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve(bitmap)));
  installCanvas();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('compressProfilePhoto', () => {
  it('outputs a 512x512 WebP at the first quality when it already fits', async () => {
    encoder = (type) => blobOfSize(50_000, type);
    const result = await compressProfilePhoto(blobOfSize(10, 'image/jpeg'));

    expect(result.type).toBe('image/webp');
    expect(encodeCalls).toEqual([{ type: 'image/webp', quality: 0.86 }]);
    expect(drawCalls[0]).toEqual([bitmap, 200, 0, 800, 800, 0, 0, PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE]);
    expect(fillCalls).toHaveLength(0);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('decodes with the EXIF orientation applied so the canvas re-encode drops metadata', async () => {
    encoder = (type) => blobOfSize(10, type);
    const file = blobOfSize(10, 'image/jpeg');
    await compressProfilePhoto(file);
    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
  });

  it('steps the quality down until the photo is within the size budget', async () => {
    encoder = (type, quality) => blobOfSize(quality > 0.75 ? PROFILE_PHOTO_MAX_BYTES + 1 : PROFILE_PHOTO_MAX_BYTES, type);
    const result = await compressProfilePhoto(blobOfSize(10, 'image/png'));

    expect(encodeCalls.map((call) => call.quality)).toEqual([0.86, 0.8, 0.72]);
    expect(result.size).toBe(PROFILE_PHOTO_MAX_BYTES);
  });

  it('returns the smallest attempt when no quality fits the budget', async () => {
    encoder = (type, quality) => blobOfSize(Math.round(PROFILE_PHOTO_MAX_BYTES * (1 + quality)), type);
    const result = await compressProfilePhoto(blobOfSize(10, 'image/png'));

    expect(result.size).toBe(Math.round(PROFILE_PHOTO_MAX_BYTES * 1.4));
  });

  it('falls back to JPEG on a white background when WebP export is unsupported', async () => {
    encoder = (type) => (type === 'image/webp' ? blobOfSize(100, 'image/png') : blobOfSize(100, type));
    const result = await compressProfilePhoto(blobOfSize(10, 'image/png'));

    expect(result.type).toBe('image/jpeg');
    expect(encodeCalls.map((call) => call.type)).toEqual(['image/webp', 'image/jpeg']);
    expect(fillCalls).toEqual([[0, 0, PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE]]);
  });

  it('uses the crop area clamped to the image bounds', async () => {
    encoder = (type) => blobOfSize(10, type);
    await compressProfilePhoto(blobOfSize(10, 'image/png'), { x: -20, y: 100, width: 900, height: 900 });
    expect(drawCalls[0]?.slice(1, 5)).toEqual([0, 100, 900, 700]);
  });

  it('rejects files that are not raster images', async () => {
    await expect(compressProfilePhoto(blobOfSize(10, 'application/pdf'))).rejects.toMatchObject({ code: 'notImage' });
    await expect(compressProfilePhoto(blobOfSize(10, 'image/svg+xml'))).rejects.toMatchObject({ code: 'notImage' });
    await expect(compressProfilePhoto(blobOfSize(10, ''))).rejects.toMatchObject({ code: 'notImage' });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('rejects files above the input limit', async () => {
    const huge = { type: 'image/jpeg', size: PROFILE_PHOTO_MAX_INPUT_BYTES + 1 } as Blob;
    await expect(compressProfilePhoto(huge)).rejects.toMatchObject({ code: 'tooLarge' });
  });

  it('reports decoding failures', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.reject(new Error('bad data'))));
    await expect(compressProfilePhoto(blobOfSize(10, 'image/heic'))).rejects.toMatchObject({ code: 'decodeFailed' });
  });

  it('reports an encoding failure when the browser exports nothing', async () => {
    encoder = () => null;
    await expect(compressProfilePhoto(blobOfSize(10, 'image/png'))).rejects.toBeInstanceOf(ProfilePhotoError);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});

describe('profilePhotoErrorKey', () => {
  it('maps errors to translation keys', () => {
    expect(profilePhotoErrorKey(new ProfilePhotoError('notImage'))).toBe('profilePhotos.errors.notImage');
    expect(profilePhotoErrorKey(new Error('x'))).toBe('profilePhotos.errors.encodeFailed');
  });
});
