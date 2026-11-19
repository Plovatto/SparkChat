import { E2E_V2_PREFIX, parseAuthenticatedField } from './authenticated-field';
import { getSodium } from './sodium';

export const INVITE_SECRET_BYTES = 16;
export const INVITE_FRAGMENT_KEY = 'join';
export const INVITE_APP_PATH = '/app/';

const SERVER_TOKEN_CONTEXT = 'sparkchat:invite-server:v1';
const PROOF_CONTEXT = 'sparkchat:invite-proof:v1';
const AEAD_CONTEXT = 'sparkchat:invite:v1';
const FIELD_SEPARATOR = '|';
const KEY_ID_SEPARATOR = ':';
const ROOM_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export interface InviteLinkTarget {
  roomId: string;
  secret: Uint8Array;
}

export interface InviteBundle {
  secret: Uint8Array;
  tokenHash: string;
  encryptedInvite: string;
}

const encoder = new TextEncoder();

function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', toBufferSource(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, toBufferSource(encoder.encode(message))));
}

async function toBase64Url(bytes: Uint8Array): Promise<string> {
  const sodium = await getSodium();
  return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
}

function assertSecret(secret: Uint8Array): void {
  if (secret.length !== INVITE_SECRET_BYTES) {
    throw new Error('Invite secret has the wrong length');
  }
}

function assertNoSeparator(...parts: string[]): void {
  if (parts.some((part) => part.includes(FIELD_SEPARATOR))) {
    throw new Error('Invite context contains the separator');
  }
}

export async function generateInviteSecret(): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.randombytes_buf(INVITE_SECRET_BYTES);
}

export async function deriveInviteToken(secret: Uint8Array): Promise<string> {
  assertSecret(secret);
  return toBase64Url(await hmacSha256(secret, SERVER_TOKEN_CONTEXT));
}

export async function hashInviteToken(inviteToken: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', toBufferSource(encoder.encode(inviteToken))));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function proofMessage(roomId: string, joinerUserId: string, joinerSigningPublicKey: string): string {
  assertNoSeparator(roomId, joinerUserId, joinerSigningPublicKey);
  return [PROOF_CONTEXT, roomId, joinerUserId, joinerSigningPublicKey].join(FIELD_SEPARATOR);
}

export async function deriveInviteProof(
  secret: Uint8Array,
  roomId: string,
  joinerUserId: string,
  joinerSigningPublicKey: string,
): Promise<string> {
  assertSecret(secret);
  return toBase64Url(await hmacSha256(secret, proofMessage(roomId, joinerUserId, joinerSigningPublicKey)));
}

export async function verifyInviteProof(
  secret: Uint8Array,
  roomId: string,
  joinerUserId: string,
  joinerSigningPublicKey: string,
  proof: unknown,
): Promise<boolean> {
  if (typeof proof !== 'string' || proof.length === 0 || secret.length !== INVITE_SECRET_BYTES) {
    return false;
  }
  let expected: string;
  try {
    expected = await deriveInviteProof(secret, roomId, joinerUserId, joinerSigningPublicKey);
  } catch {
    return false;
  }
  if (expected.length !== proof.length) {
    return false;
  }
  const sodium = await getSodium();
  return sodium.memcmp(encoder.encode(expected), encoder.encode(proof));
}

function inviteAssociatedData(roomId: string, keyId: string): Uint8Array {
  assertNoSeparator(roomId, keyId);
  return encoder.encode([AEAD_CONTEXT, roomId, keyId].join(FIELD_SEPARATOR));
}

export async function sealInviteSecret(secret: Uint8Array, roomKey: Uint8Array, roomId: string, keyId: string): Promise<string> {
  assertSecret(secret);
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(secret, inviteAssociatedData(roomId, keyId), null, nonce, roomKey);
  const combined = new Uint8Array(nonce.length + sealed.length);
  combined.set(nonce, 0);
  combined.set(sealed, nonce.length);
  return E2E_V2_PREFIX + keyId + KEY_ID_SEPARATOR + sodium.to_base64(combined);
}

export async function openInviteSecret(
  encryptedInvite: string,
  roomKey: Uint8Array,
  roomId: string,
  keyId: string,
): Promise<Uint8Array | null> {
  const parsed = parseAuthenticatedField(encryptedInvite);
  if (!parsed || parsed.keyId !== keyId) {
    return null;
  }
  try {
    const sodium = await getSodium();
    const combined = sodium.from_base64(parsed.body);
    const nonceLength = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
    if (combined.length !== nonceLength + INVITE_SECRET_BYTES + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES) {
      return null;
    }
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      combined.subarray(nonceLength),
      inviteAssociatedData(roomId, keyId),
      combined.subarray(0, nonceLength),
      roomKey,
    );
  } catch {
    return null;
  }
}

export async function createInviteBundle(roomKey: Uint8Array, roomId: string, keyId: string): Promise<InviteBundle> {
  const secret = await generateInviteSecret();
  const [tokenHash, encryptedInvite] = await Promise.all([
    deriveInviteToken(secret).then(hashInviteToken),
    sealInviteSecret(secret, roomKey, roomId, keyId),
  ]);
  return { secret, tokenHash, encryptedInvite };
}

export async function buildInviteLink(origin: string, roomId: string, secret: Uint8Array): Promise<string> {
  assertSecret(secret);
  return `${origin}${INVITE_APP_PATH}#${INVITE_FRAGMENT_KEY}=${roomId}.${await toBase64Url(secret)}`;
}

export async function parseInviteFragment(hash: string): Promise<InviteLinkTarget | null> {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(fragment);
  const value = params.get(INVITE_FRAGMENT_KEY);
  if (!value) {
    return null;
  }
  const separator = value.lastIndexOf('.');
  if (separator <= 0) {
    return null;
  }
  const roomId = value.slice(0, separator);
  const encodedSecret = value.slice(separator + 1);
  if (!ROOM_ID_PATTERN.test(roomId) || !SECRET_PATTERN.test(encodedSecret)) {
    return null;
  }
  try {
    const sodium = await getSodium();
    const secret = sodium.from_base64(encodedSecret, sodium.base64_variants.URLSAFE_NO_PADDING);
    return secret.length === INVITE_SECRET_BYTES ? { roomId, secret } : null;
  } catch {
    return null;
  }
}

export function hasInviteFragment(hash: string): boolean {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(fragment).has(INVITE_FRAGMENT_KEY);
}
