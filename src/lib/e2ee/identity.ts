import { getSodium } from './sodium';

export interface Identity {
  publicKey: string;
  privateKey: Uint8Array;
}

interface WrappedPayload {
  ciphertext: string;
  nonce: string;
  salt?: string;
}

export async function generateIdentity(): Promise<Identity> {
  const sodium = await getSodium();
  const keyPair = sodium.crypto_box_keypair();

  return {
    publicKey: sodium.to_base64(keyPair.publicKey),
    privateKey: keyPair.privateKey,
  };
}

export class IdentityKeyMismatchError extends Error {
  constructor() {
    super('The unwrapped private key does not match the published public key.');
    this.name = 'IdentityKeyMismatchError';
  }
}

export async function privateKeyMatchesPublicKey(privateKey: Uint8Array, publicKey: string): Promise<boolean> {
  const sodium = await getSodium();
  if (privateKey.length !== sodium.crypto_scalarmult_SCALARBYTES) {
    return false;
  }
  let expected: Uint8Array;
  try {
    expected = sodium.from_base64(publicKey);
  } catch {
    return false;
  }
  const derived = sodium.crypto_scalarmult_base(privateKey);
  return expected.length === derived.length && sodium.memcmp(derived, expected);
}

async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_DEFAULT,
  );
}

async function deriveKeyFromRecoveryToken(recoveryToken: string): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.crypto_generichash(sodium.crypto_secretbox_KEYBYTES, recoveryToken, null);
}

async function wrap(privateKey: Uint8Array, key: Uint8Array, salt?: Uint8Array): Promise<string> {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(privateKey, nonce, key);

  const payload: WrappedPayload = {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
    ...(salt ? { salt: sodium.to_base64(salt) } : {}),
  };

  return JSON.stringify(payload);
}

async function unwrap(wrapped: string, key: Uint8Array): Promise<Uint8Array> {
  const sodium = await getSodium();
  const payload = JSON.parse(wrapped) as WrappedPayload;
  const ciphertext = sodium.from_base64(payload.ciphertext);
  const nonce = sodium.from_base64(payload.nonce);

  return sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
}

export async function wrapPrivateKeyWithPassword(privateKey: Uint8Array, password: string): Promise<string> {
  const sodium = await getSodium();
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const key = await deriveKeyFromPassword(password, salt);
  return wrap(privateKey, key, salt);
}

export async function unwrapPrivateKeyWithPassword(wrapped: string, password: string): Promise<Uint8Array> {
  const sodium = await getSodium();
  const payload = JSON.parse(wrapped) as WrappedPayload;
  if (!payload.salt) {
    throw new Error('Bloco de chave inválido.');
  }

  const salt = sodium.from_base64(payload.salt);
  const key = await deriveKeyFromPassword(password, salt);
  return unwrap(wrapped, key);
}

export async function wrapPrivateKeyWithRecoveryToken(privateKey: Uint8Array, recoveryToken: string): Promise<string> {
  const key = await deriveKeyFromRecoveryToken(recoveryToken);
  return wrap(privateKey, key);
}

export async function unwrapPrivateKeyWithRecoveryToken(wrapped: string, recoveryToken: string): Promise<Uint8Array> {
  const key = await deriveKeyFromRecoveryToken(recoveryToken);
  return unwrap(wrapped, key);
}
