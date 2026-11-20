import { E2E_V2_PREFIX, parseAuthenticatedField } from './authenticated-field';
import { openRoomAvatar, sealRoomAvatar } from './group-invite';
import { getSodium } from './sodium';

export const PROFILE_KEY_BYTES = 32;
export const PHOTO_MIME_TYPES: ReadonlySet<string> = new Set(['image/webp', 'image/jpeg', 'image/png']);

const PROFILE_KEY_CONTEXT = 'sparkchat:profile-key:v1|';
const USER_POINTER_CONTEXT = 'sparkchat:avatar-pointer:v1';
const ENVELOPE_CONTEXT = 'sparkchat:profile-key-envelope:v1';
const ENVELOPE_SIGNATURE_CONTEXT = 'sparkchat:profile-key-sig:v1';
const USER_POINTER_PREFIX = 'e2e:pp1:';
const FIELD_SEPARATOR = '|';
const KEY_ID_SEPARATOR = ':';
const FILE_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_URL_LENGTH = 512;
const MAX_VERSION = 1_000_000_000;

export interface PhotoPointer {
  url: string;
  fileKey: string;
  mime: string;
}

export interface UserPhotoPointer extends PhotoPointer {
  fileVersion: number;
}

export interface ProfileKeyEnvelopeInput {
  userId: string;
  roomId: string;
  version: number;
  profileKey: Uint8Array;
  signingPrivateKey: Uint8Array;
  roomKey: Uint8Array;
  keyId: string;
}

export interface ProfileKeyEnvelopeExpectations {
  roomKey: Uint8Array;
  roomId: string;
  keyId: string;
  ownerId: string;
  expectedVersion: number;
  ownerSigningPublicKey: string;
}

export interface OpenedProfileKey {
  version: number;
  profileKey: Uint8Array;
  signedGrant: Uint8Array;
}

const encoder = new TextEncoder();

export function isValidProfileKeyVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= MAX_VERSION;
}

function assertSafeParts(...parts: string[]): void {
  if (parts.some((part) => part.length === 0 || part.includes(FIELD_SEPARATOR))) {
    throw new Error('Profile photo context is invalid');
  }
}

function joinContext(...parts: string[]): Uint8Array {
  return encoder.encode(parts.join(FIELD_SEPARATOR));
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const combined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

export async function deriveProfileKey(identityPrivateKey: Uint8Array, version: number): Promise<Uint8Array> {
  if (!isValidProfileKeyVersion(version)) {
    throw new Error('Invalid profile key version');
  }
  const sodium = await getSodium();
  return sodium.crypto_generichash(PROFILE_KEY_BYTES, sodium.from_string(PROFILE_KEY_CONTEXT + String(version)), identityPrivateKey);
}

function readPointer(value: unknown): PhotoPointer | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as { u?: unknown; k?: unknown; m?: unknown };
  if (
    typeof candidate.u !== 'string' ||
    candidate.u.length === 0 ||
    candidate.u.length > MAX_URL_LENGTH ||
    typeof candidate.k !== 'string' ||
    !FILE_KEY_PATTERN.test(candidate.k) ||
    typeof candidate.m !== 'string' ||
    !PHOTO_MIME_TYPES.has(candidate.m)
  ) {
    return null;
  }
  return { url: candidate.u, fileKey: candidate.k, mime: candidate.m };
}

function assertPointer(pointer: PhotoPointer): void {
  if (!readPointer({ u: pointer.url, k: pointer.fileKey, m: pointer.mime })) {
    throw new Error('Invalid photo pointer');
  }
}

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

async function aeadSeal(plaintext: Uint8Array, ad: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, ad, null, nonce, key);
  return concat(nonce, sealed);
}

async function aeadOpen(combined: Uint8Array, ad: Uint8Array, key: Uint8Array): Promise<Uint8Array | null> {
  const sodium = await getSodium();
  const nonceLength = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  if (key.length !== PROFILE_KEY_BYTES || combined.length < nonceLength + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES) {
    return null;
  }
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, combined.subarray(nonceLength), ad, combined.subarray(0, nonceLength), key);
  } catch {
    return null;
  }
}

function userPointerAd(userId: string, version: number): Uint8Array {
  assertSafeParts(userId);
  return joinContext(USER_POINTER_CONTEXT, 'user', userId, String(version));
}

export async function sealUserPhotoPointer(pointer: UserPhotoPointer, profileKey: Uint8Array, userId: string, version: number): Promise<string> {
  assertPointer(pointer);
  if (!isValidProfileKeyVersion(version) || !isValidProfileKeyVersion(pointer.fileVersion) || pointer.fileVersion > version) {
    throw new Error('Invalid photo pointer version');
  }
  const sodium = await getSodium();
  const body = encoder.encode(JSON.stringify({ u: pointer.url, k: pointer.fileKey, m: pointer.mime, f: pointer.fileVersion }));
  return USER_POINTER_PREFIX + sodium.to_base64(await aeadSeal(body, userPointerAd(userId, version), profileKey));
}

export async function openUserPhotoPointer(
  encryptedAvatar: string,
  profileKey: Uint8Array,
  userId: string,
  version: number,
): Promise<UserPhotoPointer | null> {
  if (!encryptedAvatar.startsWith(USER_POINTER_PREFIX) || !isValidProfileKeyVersion(version)) {
    return null;
  }
  try {
    const sodium = await getSodium();
    const combined = sodium.from_base64(encryptedAvatar.slice(USER_POINTER_PREFIX.length));
    const plaintext = await aeadOpen(combined, userPointerAd(userId, version), profileKey);
    if (!plaintext) {
      return null;
    }
    const parsed = decodeJson(plaintext) as { f?: unknown } | null;
    const pointer = readPointer(parsed);
    const fileVersion = parsed?.f;
    if (!pointer || !isValidProfileKeyVersion(fileVersion) || fileVersion > version) {
      return null;
    }
    return { ...pointer, fileVersion };
  } catch {
    return null;
  }
}

export async function sealRoomPhotoPointer(pointer: PhotoPointer, roomKey: Uint8Array, roomId: string, keyId: string): Promise<string> {
  assertPointer(pointer);
  return sealRoomAvatar(encoder.encode(JSON.stringify({ u: pointer.url, k: pointer.fileKey, m: pointer.mime })), roomKey, roomId, keyId);
}

export async function openRoomPhotoPointer(encryptedAvatar: string, roomKey: Uint8Array, roomId: string, keyId: string): Promise<PhotoPointer | null> {
  try {
    const plaintext = await openRoomAvatar(encryptedAvatar, roomKey, roomId, keyId);
    return plaintext ? readPointer(decodeJson(plaintext)) : null;
  } catch {
    return null;
  }
}

function envelopeAd(roomId: string, keyId: string, ownerId: string): Uint8Array {
  assertSafeParts(roomId, keyId, ownerId);
  return joinContext(ENVELOPE_CONTEXT, roomId, keyId, ownerId);
}

function signedBytes(body: Uint8Array): Uint8Array {
  return concat(encoder.encode(ENVELOPE_SIGNATURE_CONTEXT + FIELD_SEPARATOR), body);
}

export async function wrapSignedProfileGrant(
  signedGrant: Uint8Array,
  roomKey: Uint8Array,
  roomId: string,
  keyId: string,
  ownerId: string,
): Promise<string> {
  const sodium = await getSodium();
  const sealed = await aeadSeal(signedGrant, envelopeAd(roomId, keyId, ownerId), roomKey);
  return E2E_V2_PREFIX + keyId + KEY_ID_SEPARATOR + sodium.to_base64(sealed);
}

export async function createProfileKeyEnvelope(input: ProfileKeyEnvelopeInput): Promise<string> {
  if (!isValidProfileKeyVersion(input.version) || input.profileKey.length !== PROFILE_KEY_BYTES) {
    throw new Error('Invalid profile key');
  }
  assertSafeParts(input.userId, input.roomId);
  const sodium = await getSodium();
  const body = encoder.encode(
    JSON.stringify({
      u: input.userId,
      r: input.roomId,
      v: input.version,
      k: sodium.to_base64(input.profileKey, sodium.base64_variants.URLSAFE_NO_PADDING),
    }),
  );
  const signature = sodium.crypto_sign_detached(signedBytes(body), input.signingPrivateKey);
  return wrapSignedProfileGrant(concat(signature, body), input.roomKey, input.roomId, input.keyId, input.userId);
}

export async function unwrapProfileKeyEnvelope(
  envelope: string,
  roomKey: Uint8Array,
  roomId: string,
  keyId: string,
  ownerId: string,
): Promise<Uint8Array | null> {
  const parsed = parseAuthenticatedField(envelope);
  if (!parsed || parsed.keyId !== keyId) {
    return null;
  }
  try {
    const sodium = await getSodium();
    return await aeadOpen(sodium.from_base64(parsed.body), envelopeAd(roomId, keyId, ownerId), roomKey);
  } catch {
    return null;
  }
}

export async function verifySignedProfileGrant(
  signedGrant: Uint8Array,
  expectations: Omit<ProfileKeyEnvelopeExpectations, 'roomKey' | 'keyId'>,
): Promise<OpenedProfileKey | null> {
  try {
    const sodium = await getSodium();
    if (signedGrant.length <= sodium.crypto_sign_BYTES) {
      return null;
    }
    const signingPublicKey = sodium.from_base64(expectations.ownerSigningPublicKey);
    if (signingPublicKey.length !== sodium.crypto_sign_PUBLICKEYBYTES) {
      return null;
    }
    const signature = signedGrant.subarray(0, sodium.crypto_sign_BYTES);
    const body = signedGrant.subarray(sodium.crypto_sign_BYTES);
    if (!sodium.crypto_sign_verify_detached(signature, signedBytes(body), signingPublicKey)) {
      return null;
    }
    const parsed = decodeJson(body) as { u?: unknown; r?: unknown; v?: unknown; k?: unknown } | null;
    if (
      !parsed ||
      parsed.u !== expectations.ownerId ||
      parsed.r !== expectations.roomId ||
      parsed.v !== expectations.expectedVersion ||
      !isValidProfileKeyVersion(parsed.v) ||
      typeof parsed.k !== 'string'
    ) {
      return null;
    }
    const profileKey = sodium.from_base64(parsed.k, sodium.base64_variants.URLSAFE_NO_PADDING);
    if (profileKey.length !== PROFILE_KEY_BYTES) {
      return null;
    }
    return { version: parsed.v, profileKey, signedGrant: signedGrant.slice() };
  } catch {
    return null;
  }
}

export async function openProfileKeyEnvelope(envelope: string, expectations: ProfileKeyEnvelopeExpectations): Promise<OpenedProfileKey | null> {
  const signedGrant = await unwrapProfileKeyEnvelope(envelope, expectations.roomKey, expectations.roomId, expectations.keyId, expectations.ownerId);
  if (!signedGrant) {
    return null;
  }
  return verifySignedProfileGrant(signedGrant, expectations);
}

export async function rewrapProfileKeyEnvelope(
  envelope: string,
  from: { roomKey: Uint8Array; keyId: string },
  to: { roomKey: Uint8Array; keyId: string },
  roomId: string,
  ownerId: string,
): Promise<string | null> {
  const signedGrant = await unwrapProfileKeyEnvelope(envelope, from.roomKey, roomId, from.keyId, ownerId);
  return signedGrant ? wrapSignedProfileGrant(signedGrant, to.roomKey, roomId, to.keyId, ownerId) : null;
}
