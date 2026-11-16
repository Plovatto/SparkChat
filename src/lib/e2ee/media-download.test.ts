import { describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@lib/socket';
import { resolveDownloadableMediaUrl, UndecryptableMediaError } from './media-download';

const decryptResults = vi.hoisted(() => new Map<string, string>());

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

vi.mock('./message-crypto', () => ({
  isEncryptedMediaUrl: (content: string) => content.includes('e2e=1'),
  decryptMediaContentIfNeeded: (_socket: AppSocket, content: string) => Promise.resolve(decryptResults.get(content) ?? content),
}));

const socket = {} as AppSocket;
const ENCRYPTED = 'https://cdn.test/a?e2e=1';

describe('resolveDownloadableMediaUrl', () => {
  it('returns plain urls untouched', async () => {
    await expect(resolveDownloadableMediaUrl(null, 'blob:abc', undefined, null)).resolves.toBe('blob:abc');
  });

  it('returns the decrypted object url of encrypted media', async () => {
    decryptResults.set(ENCRYPTED, 'blob:decrypted');
    await expect(resolveDownloadableMediaUrl(socket, ENCRYPTED, 'room-1', null)).resolves.toBe('blob:decrypted');
    decryptResults.clear();
  });

  it('refuses to hand back ciphertext when decryption is impossible', async () => {
    await expect(resolveDownloadableMediaUrl(socket, ENCRYPTED, 'room-1', null)).rejects.toBeInstanceOf(UndecryptableMediaError);
    await expect(resolveDownloadableMediaUrl(socket, ENCRYPTED, undefined, null)).rejects.toBeInstanceOf(UndecryptableMediaError);
    await expect(resolveDownloadableMediaUrl(null, ENCRYPTED, 'room-1', null)).rejects.toBeInstanceOf(UndecryptableMediaError);
  });
});
