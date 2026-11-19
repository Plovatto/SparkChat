import { getSodium } from './sodium';

export const E2E_V2_PREFIX = 'e2e:v2:';

const AEAD_CONTEXT = 'sparkchat:msg:v2';
const SIGNATURE_CONTEXT = 'sparkchat:msg-sig:v2';
const FIELD_SEPARATOR = '|';
const KEY_ID_SEPARATOR = ':';
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export interface FieldContext {
  roomId: string;
  senderId: string;
  messageId: string;
  keyId: string;
  label: string;
}

export interface ParsedAuthenticatedField {
  keyId: string;
  body: string;
}

export function isAuthenticatedField(value: string): boolean {
  return value.startsWith(E2E_V2_PREFIX);
}

export function parseAuthenticatedField(value: string): ParsedAuthenticatedField | null {
  if (!isAuthenticatedField(value)) {
    return null;
  }
  const rest = value.slice(E2E_V2_PREFIX.length);
  const separator = rest.indexOf(KEY_ID_SEPARATOR);
  if (separator < 0) {
    return null;
  }
  const keyId = rest.slice(0, separator);
  const body = rest.slice(separator + 1);
  if (!KEY_ID_PATTERN.test(keyId) || body.length === 0) {
    return null;
  }
  return { keyId, body };
}

function contextBytes(prefix: string, context: FieldContext): Uint8Array {
  const parts = [context.roomId, context.senderId, context.messageId, context.keyId, context.label];
  if (parts.some((part) => part.includes(FIELD_SEPARATOR))) {
    throw new Error('Field context contains the separator');
  }
  const text = [prefix, ...parts].join(FIELD_SEPARATOR) + FIELD_SEPARATOR;
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
  return E2E_V2_PREFIX + context.keyId + KEY_ID_SEPARATOR + sodium.to_base64(combined);
}

export async function openAuthenticatedField(
  payload: string,
  roomKey: Uint8Array,
  senderSigningPublicKey: Uint8Array,
  context: FieldContext,
): Promise<string> {
  const parsed = parseAuthenticatedField(payload);
  if (!parsed || parsed.keyId !== context.keyId) {
    throw new Error('Authenticated field key id mismatch');
  }
  const sodium = await getSodium();
  const combined = sodium.from_base64(parsed.body);
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
