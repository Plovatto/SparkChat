import { getSodium } from './sodium';

export const E2E_V2_PREFIX = 'e2e:v2:';

const AEAD_CONTEXT = 'sparkchat:msg:v2';
const SIGNATURE_CONTEXT = 'sparkchat:msg-sig:v2';
const FIELD_SEPARATOR = '|';

export interface FieldContext {
  roomId: string;
  senderId: string;
  messageId: string;
  label: string;
}

export function isAuthenticatedField(value: string): boolean {
  return value.startsWith(E2E_V2_PREFIX);
}

function contextBytes(prefix: string, context: FieldContext): Uint8Array {
  const text = [prefix, context.roomId, context.senderId, context.messageId, context.label].join(FIELD_SEPARATOR) + FIELD_SEPARATOR;
  return new TextEncoder().encode(text);
}

function signedBytes(context: FieldContext, plaintext: Uint8Array): Uint8Array {
  const prefix = contextBytes(SIGNATURE_CONTEXT, context);
  const combined = new Uint8Array(prefix.length + plaintext.length);
  combined.set(prefix, 0);
  combined.set(plaintext, prefix.length);
  return combined;
}

export async function sealAuthenticatedField(
  plaintext: string,
  roomKey: Uint8Array,
  signingPrivateKey: Uint8Array,
  context: FieldContext,
): Promise<string> {
  const sodium = await getSodium();
  const body = new TextEncoder().encode(plaintext);
  const signature = sodium.crypto_sign_detached(signedBytes(context, body), signingPrivateKey);
  const inner = new Uint8Array(signature.length + body.length);
  inner.set(signature, 0);
  inner.set(body, signature.length);
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(inner, contextBytes(AEAD_CONTEXT, context), null, nonce, roomKey);
  const combined = new Uint8Array(nonce.length + sealed.length);
  combined.set(nonce, 0);
  combined.set(sealed, nonce.length);
  return E2E_V2_PREFIX + sodium.to_base64(combined);
}

export async function openAuthenticatedField(
  payload: string,
  roomKey: Uint8Array,
  senderSigningPublicKey: Uint8Array,
  context: FieldContext,
): Promise<string> {
  const sodium = await getSodium();
  const combined = sodium.from_base64(payload.slice(E2E_V2_PREFIX.length));
  const nonceLength = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  if (combined.length < nonceLength + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES + sodium.crypto_sign_BYTES) {
    throw new Error('Authenticated field is too short');
  }
  const nonce = combined.subarray(0, nonceLength);
  const inner = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    combined.subarray(nonceLength),
    contextBytes(AEAD_CONTEXT, context),
    nonce,
    roomKey,
  );
  const signature = inner.subarray(0, sodium.crypto_sign_BYTES);
  const body = inner.subarray(sodium.crypto_sign_BYTES);
  if (!sodium.crypto_sign_verify_detached(signature, signedBytes(context, body), senderSigningPublicKey)) {
    throw new Error('Authenticated field signature mismatch');
  }
  return sodium.to_string(body);
}
