const KIB = 1024;

export const GIF_PADDING_BUCKETS: readonly number[] = [256 * KIB, 512 * KIB, 1024 * KIB, 2048 * KIB];

const LENGTH_SUFFIX_BYTES = 4;

export class GifTooLargeError extends Error {
  constructor() {
    super('GIF is larger than the biggest padding bucket');
    this.name = 'GifTooLargeError';
  }
}

export function gifPaddingBucketFor(size: number): number | null {
  return GIF_PADDING_BUCKETS.find((bucket) => size + LENGTH_SUFFIX_BYTES <= bucket) ?? null;
}

export async function padGif(blob: Blob): Promise<Blob> {
  const bucket = gifPaddingBucketFor(blob.size);
  if (bucket === null || blob.size === 0) {
    throw new GifTooLargeError();
  }
  const padded = new Uint8Array(bucket);
  padded.set(new Uint8Array(await blob.arrayBuffer()), 0);
  new DataView(padded.buffer).setUint32(bucket - LENGTH_SUFFIX_BYTES, blob.size, false);
  return new Blob([padded], { type: 'application/octet-stream' });
}

export function unpadGif(bytes: Uint8Array, type: string): Blob | null {
  if (!GIF_PADDING_BUCKETS.includes(bytes.byteLength)) {
    return null;
  }
  const lengthOffset = bytes.byteLength - LENGTH_SUFFIX_BYTES;
  const originalSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(lengthOffset, false);
  if (originalSize === 0 || originalSize > lengthOffset) {
    return null;
  }
  for (let index = originalSize; index < lengthOffset; index += 1) {
    if (bytes[index] !== 0) {
      return null;
    }
  }
  return new Blob([bytes.slice(0, originalSize)], { type });
}
