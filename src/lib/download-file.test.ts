import { describe, expect, it, vi } from 'vitest';
import { extensionForMimeType, withFileExtension } from './download-file';

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

describe('withFileExtension', () => {
  it('keeps names that already have an extension', () => {
    expect(withFileExtension('foto.png', 'image/jpeg')).toBe('foto.png');
  });

  it('adds the extension that matches the mime type', () => {
    expect(withFileExtension('foto', 'image/jpeg')).toBe('foto.jpg');
    expect(withFileExtension('clip', 'video/quicktime')).toBe('clip.mov');
    expect(withFileExtension('doc', 'application/pdf; charset=binary')).toBe('doc.pdf');
  });

  it('leaves the name alone when the mime type gives no usable extension', () => {
    expect(withFileExtension('arquivo', null)).toBe('arquivo');
    expect(withFileExtension('arquivo', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('arquivo');
  });
});

describe('extensionForMimeType', () => {
  it('falls back to a short mime subtype', () => {
    expect(extensionForMimeType('image/bmp')).toBe('bmp');
  });
});
