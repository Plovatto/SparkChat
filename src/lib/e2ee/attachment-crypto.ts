import { ROOM_KEY_ID_BYTES } from './room-key-envelope';
import { requireCurrentRoomKey } from './room-keys';
import { getSodium } from './sodium';

export async function encryptAttachment(roomId: string, file: Blob): Promise<Blob> {
  const generation = requireCurrentRoomKey(roomId);

  const sodium = await getSodium();
  const keyIdBytes = sodium.from_base64(generation.keyId, sodium.base64_variants.URLSAFE_NO_PADDING);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(bytes, nonce, generation.key);
  const combined = new Uint8Array(keyIdBytes.length + nonce.length + ciphertext.length);
  combined.set(keyIdBytes, 0);
  combined.set(nonce, keyIdBytes.length);
  combined.set(ciphertext, keyIdBytes.length + nonce.length);

  return new Blob([combined], { type: 'application/octet-stream' });
}

export async function readAttachmentKeyId(ciphertext: ArrayBuffer): Promise<string | null> {
  const sodium = await getSodium();
  if (ciphertext.byteLength < ROOM_KEY_ID_BYTES + sodium.crypto_secretbox_NONCEBYTES + sodium.crypto_secretbox_MACBYTES) {
    return null;
  }
  return sodium.to_base64(new Uint8Array(ciphertext, 0, ROOM_KEY_ID_BYTES), sodium.base64_variants.URLSAFE_NO_PADDING);
}

export async function decryptAttachment(ciphertext: ArrayBuffer, roomKey: Uint8Array, mimeType: string): Promise<Blob | null> {
  try {
    const sodium = await getSodium();
    const combined = new Uint8Array(ciphertext);
    const nonceEnd = ROOM_KEY_ID_BYTES + sodium.crypto_secretbox_NONCEBYTES;
    const nonce = combined.subarray(ROOM_KEY_ID_BYTES, nonceEnd);
    const sealed = combined.subarray(nonceEnd);
    const plainBytes = sodium.crypto_secretbox_open_easy(sealed, nonce, roomKey);
    const plainBuffer = plainBytes.buffer.slice(plainBytes.byteOffset, plainBytes.byteOffset + plainBytes.byteLength) as ArrayBuffer;
    return new Blob([plainBuffer], { type: mimeType });
  } catch {
    return null;
  }
}
