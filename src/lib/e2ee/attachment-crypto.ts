import { getSodium } from './sodium';

export type AttachmentSlot = 'content' | 'thumbnail' | 'preview';

export interface AttachmentBinding {
  roomId: string;
  messageId: string;
  slot: AttachmentSlot;
}

export interface SealedAttachment {
  ciphertext: Blob;
  key: string;
}

const AD_PREFIX = 'sparkchat:attachment:v1';
const KEY_BYTES = 32;
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function associatedData({ roomId, messageId, slot }: AttachmentBinding): string {
  return `${AD_PREFIX}|${roomId}|${messageId}|${slot}`;
}

export async function sealAttachment(file: Blob, binding: AttachmentBinding): Promise<SealedAttachment> {
  const sodium = await getSodium();
  const key = sodium.randombytes_buf(KEY_BYTES);
  const plaintext = new Uint8Array(await file.arrayBuffer());
  try {
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, associatedData(binding), null, nonce, key);
    const combined = new Uint8Array(nonce.length + sealed.length);
    combined.set(nonce, 0);
    combined.set(sealed, nonce.length);
    return {
      ciphertext: new Blob([combined], { type: 'application/octet-stream' }),
      key: sodium.to_base64(key, sodium.base64_variants.URLSAFE_NO_PADDING),
    };
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }
}

export async function openAttachment(
  ciphertext: ArrayBuffer,
  encodedKey: string,
  binding: AttachmentBinding,
  mimeType: string,
): Promise<Blob | null> {
  if (!KEY_PATTERN.test(encodedKey)) {
    return null;
  }
  const sodium = await getSodium();
  const nonceBytes = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  if (ciphertext.byteLength < nonceBytes + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES) {
    return null;
  }
  let key: Uint8Array | null = null;
  try {
    key = sodium.from_base64(encodedKey, sodium.base64_variants.URLSAFE_NO_PADDING);
    if (key.length !== KEY_BYTES) {
      return null;
    }
    const combined = new Uint8Array(ciphertext);
    const plainBytes = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      combined.subarray(nonceBytes),
      associatedData(binding),
      combined.subarray(0, nonceBytes),
      key,
    );
    const plainBuffer = plainBytes.buffer.slice(plainBytes.byteOffset, plainBytes.byteOffset + plainBytes.byteLength) as ArrayBuffer;
    plainBytes.fill(0);
    return new Blob([plainBuffer], { type: mimeType });
  } catch {
    return null;
  } finally {
    key?.fill(0);
  }
}
