import { describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@lib/socket';
import { resolveDownloadableMediaUrl, UndecryptableMediaError, UntrustedMediaSourceError } from './media-download';

const decryptResults = vi.hoisted(() => new Map<string, string>());
const decryptCalls = vi.hoisted(() => [] as string[]);

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

vi.mock('./message-crypto', () => ({
  isEncryptedMediaUrl: (content: string) => content.includes('e2e=1'),
  decryptMediaContentIfNeeded: (_socket: AppSocket, content: string, _roomId: string, _fileMeta: unknown, messageType: string) => {
    decryptCalls.push(messageType);
    return Promise.resolve(decryptResults.get(content) ?? content);
  },
}));

const socket = {} as AppSocket;
const ENCRYPTED = 'https://cdn.test/uploads/files/a.bin?e2e=1';
const PLAIN = 'https://cdn.test/uploads/files/a.bin';

describe('resolveDownloadableMediaUrl', () => {
  it('returns local object urls untouched', async () => {
    await expect(resolveDownloadableMediaUrl(null, 'blob:abc', undefined, null, 'file')).resolves.toBe('blob:abc');
  });

  it('returns plain storage urls untouched', async () => {
    await expect(resolveDownloadableMediaUrl(null, PLAIN, undefined, null, 'file')).resolves.toBe(PLAIN);
  });

  it('refuses media hosted outside the storage paths', async () => {
    await expect(resolveDownloadableMediaUrl(socket, 'https://evil.test/x.html', 'room-1', null, 'file')).rejects.toBeInstanceOf(
      UntrustedMediaSourceError,
    );
    await expect(resolveDownloadableMediaUrl(socket, 'http://cdn.test/uploads/files/a.bin', 'room-1', null, 'file')).rejects.toBeInstanceOf(
      UntrustedMediaSourceError,
    );
  });

  it('returns the decrypted object url of encrypted media and forwards the message type', async () => {
    decryptResults.set(ENCRYPTED, 'blob:decrypted');
    decryptCalls.length = 0;
    await expect(resolveDownloadableMediaUrl(socket, ENCRYPTED, 'room-1', null, 'image')).resolves.toBe('blob:decrypted');
    expect(decryptCalls).toEqual(['image']);
    decryptResults.clear();
  });

  it('refuses to hand back ciphertext when decryption is impossible', async () => {
    await expect(resolveDownloadableMediaUrl(socket, ENCRYPTED, 'room-1', null, 'file')).rejects.toBeInstanceOf(UndecryptableMediaError);
    await expect(resolveDownloadableMediaUrl(socket, ENCRYPTED, undefined, null, 'file')).rejects.toBeInstanceOf(UndecryptableMediaError);
    await expect(resolveDownloadableMediaUrl(null, ENCRYPTED, 'room-1', null, 'file')).rejects.toBeInstanceOf(UndecryptableMediaError);
  });
});
