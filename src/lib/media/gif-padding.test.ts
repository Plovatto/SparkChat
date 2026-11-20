import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GIF_PADDING_BUCKETS, GifTooLargeError, gifPaddingBucketFor, padGif, unpadGif } from './gif-padding';

const KIB = 1024;

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function mediaOfSize(size: number): Blob {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    bytes[index] = (index % 251) + 1;
  }
  return new Blob([bytes], { type: 'image/webp' });
}

describe('gif padding buckets', () => {
  it('uses the smallest bucket that fits the media and its length suffix', () => {
    expect(GIF_PADDING_BUCKETS).toEqual([256 * KIB, 512 * KIB, 1024 * KIB, 2048 * KIB]);
    expect(gifPaddingBucketFor(1)).toBe(256 * KIB);
    expect(gifPaddingBucketFor(256 * KIB - 4)).toBe(256 * KIB);
    expect(gifPaddingBucketFor(256 * KIB - 3)).toBe(512 * KIB);
    expect(gifPaddingBucketFor(1024 * KIB)).toBe(2048 * KIB);
    expect(gifPaddingBucketFor(2048 * KIB - 4)).toBe(2048 * KIB);
    expect(gifPaddingBucketFor(2048 * KIB - 3)).toBeNull();
  });
});

describe('padGif', () => {
  it('appends zeros and the big-endian original size up to the bucket', async () => {
    const padded = await bytesOf(await padGif(mediaOfSize(300)));

    expect(padded.byteLength).toBe(256 * KIB);
    expect(padded.subarray(0, 300)).toEqual(await bytesOf(mediaOfSize(300)));
    expect(padded.subarray(300, padded.byteLength - 4).every((byte) => byte === 0)).toBe(true);
    expect([...padded.subarray(padded.byteLength - 4)]).toEqual([0, 0, 1, 44]);
  });

  it('fills exactly the edges of each bucket', async () => {
    expect((await padGif(mediaOfSize(256 * KIB - 4))).size).toBe(256 * KIB);
    expect((await padGif(mediaOfSize(256 * KIB - 3))).size).toBe(512 * KIB);
    expect((await padGif(mediaOfSize(2048 * KIB - 4))).size).toBe(2048 * KIB);
  });

  it('refuses media larger than the biggest bucket and empty media', async () => {
    await expect(padGif(mediaOfSize(2048 * KIB - 3))).rejects.toBeInstanceOf(GifTooLargeError);
    await expect(padGif(new Blob([]))).rejects.toBeInstanceOf(GifTooLargeError);
  });
});

describe('unpadGif', () => {
  it('restores the original media with the given type', async () => {
    const original = mediaOfSize(1234);
    const restored = unpadGif(await bytesOf(await padGif(original)), 'image/webp');

    expect(restored?.type).toBe('image/webp');
    expect(await bytesOf(restored as Blob)).toEqual(await bytesOf(original));
  });

  it('round-trips any size that fits a bucket', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 600 * KIB }), async (size) => {
        const padded = await bytesOf(await padGif(mediaOfSize(size)));
        expect(GIF_PADDING_BUCKETS).toContain(padded.byteLength);
        expect(unpadGif(padded, 'image/gif')?.size).toBe(size);
      }),
      { numRuns: 20 },
    );
  });

  it('rejects lengths that are not a bucket', () => {
    expect(unpadGif(new Uint8Array(1000), 'image/webp')).toBeNull();
    expect(unpadGif(new Uint8Array(256 * KIB + 1), 'image/webp')).toBeNull();
  });

  it('rejects a zero, oversized or inconsistent original size', async () => {
    const zero = new Uint8Array(256 * KIB);
    expect(unpadGif(zero, 'image/webp')).toBeNull();

    const oversized = new Uint8Array(256 * KIB);
    new DataView(oversized.buffer).setUint32(oversized.byteLength - 4, 256 * KIB - 3, false);
    expect(unpadGif(oversized, 'image/webp')).toBeNull();

    const dirtyPadding = await bytesOf(await padGif(mediaOfSize(10)));
    dirtyPadding[100] = 7;
    expect(unpadGif(dirtyPadding, 'image/webp')).toBeNull();
  });
});
