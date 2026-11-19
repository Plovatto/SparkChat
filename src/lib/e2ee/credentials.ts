import { getSodium } from './sodium';

const AUTH_CONTEXT = 'sparkchat:auth:v2';
const WRAP_CONTEXT = 'sparkchat:wrap:v2';
const RECOVERY_AUTH_CONTEXT = 'sparkchat:recovery-auth:v2';
const RECOVERY_WRAP_CONTEXT = 'sparkchat:recovery-wrap:v2';
const IDENTITY_AAD_PREFIX = 'sparkchat:identity:v2:';
const DERIVED_KEY_BYTES = 32;
const RECOVERY_SECRET_BYTES = 32;
const PWHASH_OPSLIMIT = 3;
const PWHASH_MEMLIMIT = 67108864;
const RECOVERY_FILE_TYPE = 'sparkchat-recovery';
const RECOVERY_FILE_VERSION = 2;
const BASE64_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface PasswordCredentials {
  authKey: string;
  wrapKey: Uint8Array;
}

export interface RecoveryCredentials {
  recoveryKey: string;
  recoveryWrapKey: Uint8Array;
}

export interface RecoveryFileContents {
  userId: string;
  nickname: string;
  secret: Uint8Array;
}

interface WrappedPayloadV2 {
  v: number;
  ciphertext: string;
  nonce: string;
}

export class InvalidRecoveryFileError extends Error {
  constructor() {
    super('The recovery file is not a valid v2 recovery file.');
    this.name = 'InvalidRecoveryFileError';
  }
}

export async function generateAuthSalt(): Promise<string> {
  const sodium = await getSodium();
  return sodium.to_base64(sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES));
}

export async function generateRecoverySecret(): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.randombytes_buf(RECOVERY_SECRET_BYTES);
}

export async function derivePasswordCredentials(password: string, authSalt: string): Promise<PasswordCredentials> {
  const sodium = await getSodium();
  const master = sodium.crypto_pwhash(
    DERIVED_KEY_BYTES,
    password,
    sodium.from_base64(authSalt),
    PWHASH_OPSLIMIT,
    PWHASH_MEMLIMIT,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  try {
    const authKey = sodium.to_base64(sodium.crypto_generichash(DERIVED_KEY_BYTES, AUTH_CONTEXT, master));
    const wrapKey = sodium.crypto_generichash(DERIVED_KEY_BYTES, WRAP_CONTEXT, master);
    return { authKey, wrapKey };
  } finally {
    master.fill(0);
  }
}

export async function deriveRecoveryCredentials(secret: Uint8Array): Promise<RecoveryCredentials> {
  const sodium = await getSodium();
  return {
    recoveryKey: sodium.to_base64(sodium.crypto_generichash(DERIVED_KEY_BYTES, RECOVERY_AUTH_CONTEXT, secret)),
    recoveryWrapKey: sodium.crypto_generichash(DERIVED_KEY_BYTES, RECOVERY_WRAP_CONTEXT, secret),
  };
}

function identityAad(userId: string, publicKey: string): string {
  return `${IDENTITY_AAD_PREFIX}${userId}:${publicKey}`;
}

export async function wrapPrivateKeyV2(privateKey: Uint8Array, key: Uint8Array, userId: string, publicKey: string): Promise<string> {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(privateKey, identityAad(userId, publicKey), null, nonce, key);
  const payload: WrappedPayloadV2 = { v: 2, ciphertext: sodium.to_base64(ciphertext), nonce: sodium.to_base64(nonce) };
  return JSON.stringify(payload);
}

export async function unwrapPrivateKeyV2(wrapped: string, key: Uint8Array, userId: string, publicKey: string): Promise<Uint8Array> {
  const sodium = await getSodium();
  const payload = JSON.parse(wrapped) as Partial<WrappedPayloadV2> | null;
  if (payload?.v !== 2 || typeof payload.ciphertext !== 'string' || typeof payload.nonce !== 'string') {
    throw new Error('Unsupported identity wrap version.');
  }
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    sodium.from_base64(payload.ciphertext),
    identityAad(userId, publicKey),
    sodium.from_base64(payload.nonce),
    key,
  );
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function buildRecoveryFile({ userId, nickname, secret }: RecoveryFileContents): Promise<string> {
  const sodium = await getSodium();
  const contents = JSON.stringify({
    type: RECOVERY_FILE_TYPE,
    version: RECOVERY_FILE_VERSION,
    userId,
    nickname,
    secret: sodium.to_base64(secret),
  });
  return utf8ToBase64(contents);
}

export async function parseRecoveryFile(text: string): Promise<RecoveryFileContents> {
  const sodium = await getSodium();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidRecoveryFileError();
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new InvalidRecoveryFileError();
  }
  const { type, version, userId, nickname, secret } = parsed as Record<string, unknown>;
  if (
    type !== RECOVERY_FILE_TYPE ||
    version !== RECOVERY_FILE_VERSION ||
    typeof userId !== 'string' ||
    userId.length === 0 ||
    typeof nickname !== 'string' ||
    typeof secret !== 'string' ||
    !BASE64_KEY_PATTERN.test(secret)
  ) {
    throw new InvalidRecoveryFileError();
  }
  let secretBytes: Uint8Array;
  try {
    secretBytes = sodium.from_base64(secret);
  } catch {
    throw new InvalidRecoveryFileError();
  }
  if (secretBytes.length !== RECOVERY_SECRET_BYTES) {
    throw new InvalidRecoveryFileError();
  }
  return { userId, nickname, secret: secretBytes };
}
