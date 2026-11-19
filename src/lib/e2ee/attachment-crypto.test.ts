import { describe, expect, it, vi } from 'vitest';
import { openAttachment, sealAttachment, type AttachmentBinding } from './attachment-crypto';
import { getSodium } from './sodium';

const BINDING: AttachmentBinding = { roomId: 'room-1', messageId: '0f8fad5b-d9cb-469f-a165-70867728950e', slot: 'content' };
const PLAINTEXT = new Uint8Array([1, 2, 3, 4, 5, 250]);

async function bytesOf(blob: Blob | null): Promise<number[]> {
  return blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : [];
}

describe('sealAttachment', () => {
  it('produces nonce || XChaCha20-Poly1305 bound to the room, message and slot', async () => {
    const sodium = await getSodium();
    const { ciphertext, key } = await sealAttachment(new Blob([PLAINTEXT]), BINDING);
    const combined = new Uint8Array(await ciphertext.arrayBuffer());

    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ciphertext.type).toBe('application/octet-stream');
    expect(combined.length).toBe(24 + PLAINTEXT.length + 16);

    const opened = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      combined.subarray(24),
      `sparkchat:attachment:v1|${BINDING.roomId}|${BINDING.messageId}|content`,
      combined.subarray(0, 24),
      sodium.from_base64(key, sodium.base64_variants.URLSAFE_NO_PADDING),
    );
    expect(Array.from(opened)).toEqual(Array.from(PLAINTEXT));
  });

  it('uses a fresh random key and nonce for every attachment', async () => {
    const first = await sealAttachment(new Blob([PLAINTEXT]), BINDING);
    const second = await sealAttachment(new Blob([PLAINTEXT]), BINDING);

    expect(first.key).not.toBe(second.key);
    expect(await bytesOf(first.ciphertext)).not.toEqual(await bytesOf(second.ciphertext));
  });

  it('zeroes the raw file key after sealing', async () => {
    const sodium = await getSodium();
    const generated: Uint8Array[] = [];
    const original = sodium.randombytes_buf.bind(sodium);
    const spy = vi.spyOn(sodium, 'randombytes_buf').mockImplementation(((length: number) => {
      const bytes = original(length);
      generated.push(bytes);
      return bytes;
    }) as typeof sodium.randombytes_buf);

    await sealAttachment(new Blob([PLAINTEXT]), BINDING);
    spy.mockRestore();

    const rawKey = generated.find((bytes) => bytes.length === 32);
    expect(rawKey && Array.from(rawKey).every((byte) => byte === 0)).toBe(true);
  });
});

describe('openAttachment', () => {
  it('opens with the matching key and binding and applies the given type', async () => {
    const { ciphertext, key } = await sealAttachment(new Blob([PLAINTEXT]), BINDING);
    const opened = await openAttachment(await ciphertext.arrayBuffer(), key, BINDING, 'image/png');

    expect(opened?.type).toBe('image/png');
    expect(await bytesOf(opened)).toEqual(Array.from(PLAINTEXT));
  });

  it.each([
    ['another room', { ...BINDING, roomId: 'room-2' }],
    ['another message', { ...BINDING, messageId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }],
    ['the thumbnail slot', { ...BINDING, slot: 'thumbnail' as const }],
    ['the preview slot', { ...BINDING, slot: 'preview' as const }],
  ])('rejects the object when opened for %s', async (_label, binding) => {
    const { ciphertext, key } = await sealAttachment(new Blob([PLAINTEXT]), BINDING);
    await expect(openAttachment(await ciphertext.arrayBuffer(), key, binding, 'image/png')).resolves.toBeNull();
  });

  it('rejects another attachment key, malformed keys, tampering and truncated objects', async () => {
    const { ciphertext, key } = await sealAttachment(new Blob([PLAINTEXT]), BINDING);
    const other = await sealAttachment(new Blob([PLAINTEXT]), BINDING);
    const bytes = new Uint8Array(await ciphertext.arrayBuffer());
    const tampered = bytes.slice();
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;

    await expect(openAttachment(bytes.slice().buffer, other.key, BINDING, 'image/png')).resolves.toBeNull();
    await expect(openAttachment(bytes.slice().buffer, 'short', BINDING, 'image/png')).resolves.toBeNull();
    await expect(openAttachment(bytes.slice().buffer, `${key.slice(0, 42)}+`, BINDING, 'image/png')).resolves.toBeNull();
    await expect(openAttachment(tampered.buffer, key, BINDING, 'image/png')).resolves.toBeNull();
    await expect(openAttachment(bytes.slice(0, 30).buffer, key, BINDING, 'image/png')).resolves.toBeNull();
  });
});
