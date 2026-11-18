import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { clearDecryptedMediaCache, getDecryptedMediaCacheSize, resolveDecryptedMediaUrl } from './media-cache';

describe('decrypted media cache', () => {
  let revoke: MockInstance<typeof URL.revokeObjectURL>;

  beforeEach(() => {
    revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clearDecryptedMediaCache();
    revoke.mockRestore();
  });

  it('decrypts each content once and reuses the object url', async () => {
    const decrypt = vi.fn(() => Promise.resolve('blob:one'));

    const [first, second] = await Promise.all([
      resolveDecryptedMediaUrl('https://cdn.test/a?e2e=1', 'image/png', decrypt),
      resolveDecryptedMediaUrl('https://cdn.test/a?e2e=1', 'image/png', decrypt),
    ]);
    const third = await resolveDecryptedMediaUrl('https://cdn.test/a?e2e=1', 'image/png', decrypt);

    expect([first, second, third]).toEqual(['blob:one', 'blob:one', 'blob:one']);
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  it('never revokes object urls that views may still hold while the session lasts', async () => {
    for (let index = 0; index < 1000; index += 1) {
      await resolveDecryptedMediaUrl(`https://cdn.test/${index}?e2e=1`, 'image/png', () => Promise.resolve(`blob:${index}`));
    }

    expect(revoke).not.toHaveBeenCalled();
    expect(getDecryptedMediaCacheSize()).toBe(1000);
    await expect(resolveDecryptedMediaUrl('https://cdn.test/0?e2e=1', 'image/png', () => Promise.resolve('blob:new'))).resolves.toBe('blob:0');
  });

  it('keeps a separate object url per resolved type so a later message cannot inherit an earlier type', async () => {
    const asOpaque = await resolveDecryptedMediaUrl('https://cdn.test/a?e2e=1', 'application/octet-stream', () => Promise.resolve('blob:opaque'));
    const asPdf = await resolveDecryptedMediaUrl('https://cdn.test/a?e2e=1', 'application/pdf', () => Promise.resolve('blob:pdf'));

    expect(asOpaque).toBe('blob:opaque');
    expect(asPdf).toBe('blob:pdf');
    expect(getDecryptedMediaCacheSize()).toBe(2);
  });

  it('falls back to the original content when decryption fails', async () => {
    await expect(resolveDecryptedMediaUrl('https://cdn.test/x?e2e=1', 'image/png', () => Promise.resolve(null))).resolves.toBe('https://cdn.test/x?e2e=1');
    expect(getDecryptedMediaCacheSize()).toBe(0);
  });

  it('revokes every object url when cleared', async () => {
    await resolveDecryptedMediaUrl('https://cdn.test/a?e2e=1', 'image/png', () => Promise.resolve('blob:a'));
    await resolveDecryptedMediaUrl('https://cdn.test/b?e2e=1', 'image/png', () => Promise.resolve('blob:b'));

    clearDecryptedMediaCache();

    expect(revoke.mock.calls.map((call) => call[0])).toEqual(['blob:a', 'blob:b']);
    expect(getDecryptedMediaCacheSize()).toBe(0);
  });

  it('revokes and does not cache a decryption that finishes after the cache was cleared', async () => {
    let finish: (value: string) => void = () => undefined;
    const pending = resolveDecryptedMediaUrl(
      'https://cdn.test/late?e2e=1',
      'image/png',
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );

    clearDecryptedMediaCache();
    finish('blob:late');

    await expect(pending).resolves.toBe('https://cdn.test/late?e2e=1');
    expect(revoke).toHaveBeenCalledWith('blob:late');
    expect(getDecryptedMediaCacheSize()).toBe(0);
  });
});
