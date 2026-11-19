import { describe, expect, it, vi } from 'vitest';
import type { MessageType } from '@lib/socket';
import { resolveDownloadableMediaUrl, UndecryptableMediaError, UntrustedMediaSourceError } from './media-download';

const decryptResults = vi.hoisted(() => new Map<string, string>());
const decryptCalls = vi.hoisted(() => [] as { messageType: string; messageId: string }[]);

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

vi.mock('./message-crypto', () => ({
  isEncryptedMediaUrl: (content: string) => content.includes('e2e=1'),
  decryptMediaContentIfNeeded: (content: string, source: { messageType: string; messageId: string }) => {
    decryptCalls.push({ messageType: source.messageType, messageId: source.messageId });
    return Promise.resolve(decryptResults.get(content) ?? content);
  },
}));

const ENCRYPTED = 'https://cdn.test/uploads/files/a.bin?e2e=1';
const PLAIN = 'https://cdn.test/uploads/files/a.bin';

function request(content: string, roomId: string | undefined, messageId: string | undefined, messageType: MessageType = 'file') {
  return { content, roomId, messageId, fileMeta: null, messageType };
}

describe('resolveDownloadableMediaUrl', () => {
  it('returns local object urls untouched', async () => {
    await expect(resolveDownloadableMediaUrl(request('blob:abc', undefined, undefined))).resolves.toBe('blob:abc');
  });

  it('returns plain storage urls untouched', async () => {
    await expect(resolveDownloadableMediaUrl(request(PLAIN, undefined, undefined))).resolves.toBe(PLAIN);
  });

  it('refuses media hosted outside the storage paths', async () => {
    await expect(resolveDownloadableMediaUrl(request('https://evil.test/x.html', 'room-1', 'm-1'))).rejects.toBeInstanceOf(UntrustedMediaSourceError);
    await expect(resolveDownloadableMediaUrl(request('http://cdn.test/uploads/files/a.bin', 'room-1', 'm-1'))).rejects.toBeInstanceOf(
      UntrustedMediaSourceError,
    );
  });

  it('returns the decrypted object url of encrypted media and forwards the message id and type', async () => {
    decryptResults.set(ENCRYPTED, 'blob:decrypted');
    decryptCalls.length = 0;
    await expect(resolveDownloadableMediaUrl(request(ENCRYPTED, 'room-1', 'm-1', 'image'))).resolves.toBe('blob:decrypted');
    expect(decryptCalls).toEqual([{ messageType: 'image', messageId: 'm-1' }]);
    decryptResults.clear();
  });

  it('refuses to hand back ciphertext when decryption is impossible', async () => {
    await expect(resolveDownloadableMediaUrl(request(ENCRYPTED, 'room-1', 'm-1'))).rejects.toBeInstanceOf(UndecryptableMediaError);
    await expect(resolveDownloadableMediaUrl(request(ENCRYPTED, undefined, 'm-1'))).rejects.toBeInstanceOf(UndecryptableMediaError);
    await expect(resolveDownloadableMediaUrl(request(ENCRYPTED, 'room-1', undefined))).rejects.toBeInstanceOf(UndecryptableMediaError);
  });
});
