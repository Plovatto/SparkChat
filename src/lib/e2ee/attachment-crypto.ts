import { getCachedRoomKey } from './room-keys';
import { getSodium } from './sodium';

export interface EncryptedAttachment {
  blob: Blob;
  encrypted: boolean;
}

export async function encryptAttachmentIfPossible(roomId: string, file: Blob): Promise<EncryptedAttachment> {
  const roomKey = getCachedRoomKey(roomId);
  if (!roomKey) {
    return { blob: file, encrypted: false };
  }

  const sodium = await getSodium();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(bytes, nonce, roomKey);
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);

  return { blob: new Blob([combined], { type: 'application/octet-stream' }), encrypted: true };
}

export async function decryptAttachment(roomId: string, ciphertext: ArrayBuffer, mimeType: string): Promise<Blob | null> {
  const roomKey = getCachedRoomKey(roomId);
  if (!roomKey) {
    return null;
  }

  try {
    const sodium = await getSodium();
    const combined = new Uint8Array(ciphertext);
    const nonce = combined.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
    const sealed = combined.subarray(sodium.crypto_secretbox_NONCEBYTES);
    const plainBytes = sodium.crypto_secretbox_open_easy(sealed, nonce, roomKey);
    const plainBuffer = plainBytes.buffer.slice(plainBytes.byteOffset, plainBytes.byteOffset + plainBytes.byteLength) as ArrayBuffer;
    return new Blob([plainBuffer], { type: mimeType });
  } catch {
    return null;
  }
}
