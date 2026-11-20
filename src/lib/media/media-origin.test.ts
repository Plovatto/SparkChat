import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuredMediaOrigin, isStorageMediaUrl } from './media-origin';

describe('isStorageMediaUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts https upload paths when no media origin is configured', () => {
    expect(isStorageMediaUrl('https://cdn.test/uploads/images/a.png?e2e=1', null)).toBe(true);
    expect(isStorageMediaUrl('https://cdn.test/uploads/audio/a.webm', null)).toBe(true);
    expect(isStorageMediaUrl('https://cdn.test/uploads/files/a.pdf?e2e=1', null)).toBe(true);
    expect(isStorageMediaUrl('https://cdn.test/uploads/gifs/a.bin?e2e=1', null)).toBe(true);
  });

  it('rejects insecure, foreign-path and credentialed urls', () => {
    expect(isStorageMediaUrl('http://cdn.test/uploads/images/a.png', null)).toBe(false);
    expect(isStorageMediaUrl('https://cdn.test/other/a.png', null)).toBe(false);
    expect(isStorageMediaUrl('https://cdn.test/uploads/images/nested/a.png', null)).toBe(false);
    expect(isStorageMediaUrl('https://cdn.test/uploads/avatars/a.png', null)).toBe(false);
    expect(isStorageMediaUrl('https://cdn.test/uploads/gifs/nested/a.bin', null)).toBe(false);
    expect(isStorageMediaUrl('https://static.klipy.com/ii/abc/a.webp', null)).toBe(false);
    expect(isStorageMediaUrl('https://user:pass@cdn.test/uploads/images/a.png', null)).toBe(false);
    expect(isStorageMediaUrl('blob:https://app.test/1', null)).toBe(false);
    expect(isStorageMediaUrl('not a url', null)).toBe(false);
  });

  it('requires the configured media origin when one is set', () => {
    expect(isStorageMediaUrl('https://media.test/uploads/images/a.png', 'https://media.test')).toBe(true);
    expect(isStorageMediaUrl('https://evil.test/uploads/images/a.png', 'https://media.test')).toBe(false);
  });

  it('reads the media origin from the environment', () => {
    vi.stubEnv('VITE_MEDIA_ORIGIN', 'https://media.test/some/path');
    expect(configuredMediaOrigin()).toBe('https://media.test');
    expect(isStorageMediaUrl('https://evil.test/uploads/images/a.png')).toBe(false);
    expect(isStorageMediaUrl('https://media.test/uploads/images/a.png')).toBe(true);

    vi.stubEnv('VITE_MEDIA_ORIGIN', '');
    expect(configuredMediaOrigin()).toBeNull();
  });
});
