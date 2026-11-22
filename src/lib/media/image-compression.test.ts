import { afterEach, describe, expect, it, vi } from 'vitest';
import { canDecodeImage } from './image-compression';

function stubImage(decodes: boolean, width = 10) {
  class FakeImage {
    src = '';
    naturalWidth = 0;
    decode() {
      if (!decodes) {
        return Promise.reject(new Error('EncodingError'));
      }
      this.naturalWidth = width;
      return Promise.resolve();
    }
  }
  vi.stubGlobal('Image', FakeImage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canDecodeImage', () => {
  it('reports a real image as decodable and releases its object url', async () => {
    stubImage(true);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');

    await expect(canDecodeImage(new Blob(['png'], { type: 'image/png' }))).resolves.toBe(true);
    expect(revoke).toHaveBeenCalled();
  });

  it('reports a file the browser cannot decode', async () => {
    stubImage(false);

    await expect(canDecodeImage(new Blob(['text'], { type: 'image/jpeg' }))).resolves.toBe(false);
  });

  it('treats an image without pixels as undecodable', async () => {
    stubImage(true, 0);

    await expect(canDecodeImage(new Blob(['x'], { type: 'image/png' }))).resolves.toBe(false);
  });
});
