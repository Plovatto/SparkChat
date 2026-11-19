import { describe, expect, it } from 'vitest';
import {
  buildRecoveryFile,
  deriveRecoveryCredentials,
  derivePasswordCredentials,
  generateAuthSalt,
  generateRecoverySecret,
  InvalidRecoveryFileError,
  isWrappedV2,
  parseRecoveryFile,
  unwrapPrivateKeyV2,
  wrapPrivateKeyV2,
} from './credentials';
import { generateIdentity, unwrapPrivateKeyWithPassword, unwrapPrivateKeyWithRecoveryToken, wrapPrivateKeyWithRecoveryToken } from './identity';
import { getSodium } from './sodium';

const FIXED_SALT = 'AAECAwQFBgcICQoLDA0ODw';
const BASE64_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

function decodeFile(base64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
}

async function legacyPasswordWrap(privateKey: Uint8Array, password: string): Promise<string> {
  const sodium = await getSodium();
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_DEFAULT,
  );
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  return JSON.stringify({
    ciphertext: sodium.to_base64(sodium.crypto_secretbox_easy(privateKey, nonce, key)),
    nonce: sodium.to_base64(nonce),
    salt: sodium.to_base64(salt),
  });
}

describe('password derivation', () => {
  it('generates url-safe 16 byte salts', async () => {
    const salt = await generateAuthSalt();
    expect(salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await generateAuthSalt()).not.toBe(salt);
  });

  it('is deterministic for the same password and salt', async () => {
    const first = await derivePasswordCredentials('correct horse', FIXED_SALT);
    const second = await derivePasswordCredentials('correct horse', FIXED_SALT);
    expect(first.authKey).toBe(second.authKey);
    expect(Array.from(first.wrapKey)).toEqual(Array.from(second.wrapKey));
    expect(first.authKey).toMatch(BASE64_32_BYTES);
    expect(first.wrapKey).toHaveLength(32);
  });

  it('separates the auth key from the wrap key and changes with the salt or password', async () => {
    const sodium = await getSodium();
    const base = await derivePasswordCredentials('correct horse', FIXED_SALT);
    expect(base.authKey).not.toBe(sodium.to_base64(base.wrapKey));
    expect((await derivePasswordCredentials('correct horse', await generateAuthSalt())).authKey).not.toBe(base.authKey);
    expect((await derivePasswordCredentials('wrong horse', FIXED_SALT)).authKey).not.toBe(base.authKey);
  });
});

describe('recovery derivation', () => {
  it('derives distinct auth and wrap keys from the secret', async () => {
    const sodium = await getSodium();
    const secret = await generateRecoverySecret();
    const { recoveryKey, recoveryWrapKey } = await deriveRecoveryCredentials(secret);
    expect(secret).toHaveLength(32);
    expect(recoveryKey).toMatch(BASE64_32_BYTES);
    expect(recoveryKey).not.toBe(sodium.to_base64(recoveryWrapKey));
    expect((await deriveRecoveryCredentials(secret)).recoveryKey).toBe(recoveryKey);
  });
});

describe('identity wrap v2', () => {
  it('round-trips the private key bound to the user and public key', async () => {
    const identity = await generateIdentity();
    const { wrapKey } = await derivePasswordCredentials('pw-123456', FIXED_SALT);
    const wrapped = await wrapPrivateKeyV2(identity.privateKey, wrapKey, 'user-1', identity.publicKey);
    expect(JSON.parse(wrapped)).toMatchObject({ v: 2 });
    expect(JSON.parse(wrapped)).not.toHaveProperty('salt');
    expect(isWrappedV2(wrapped)).toBe(true);
    const unwrapped = await unwrapPrivateKeyV2(wrapped, wrapKey, 'user-1', identity.publicKey);
    expect(Array.from(unwrapped)).toEqual(Array.from(identity.privateKey));
  });

  it('fails for another user, another public key or another key', async () => {
    const [identity, other] = await Promise.all([generateIdentity(), generateIdentity()]);
    const secret = await generateRecoverySecret();
    const { recoveryWrapKey } = await deriveRecoveryCredentials(secret);
    const wrapped = await wrapPrivateKeyV2(identity.privateKey, recoveryWrapKey, 'user-1', identity.publicKey);
    const { recoveryWrapKey: wrongKey } = await deriveRecoveryCredentials(await generateRecoverySecret());

    await expect(unwrapPrivateKeyV2(wrapped, recoveryWrapKey, 'user-2', identity.publicKey)).rejects.toThrow();
    await expect(unwrapPrivateKeyV2(wrapped, recoveryWrapKey, 'user-1', other.publicKey)).rejects.toThrow();
    await expect(unwrapPrivateKeyV2(wrapped, wrongKey, 'user-1', identity.publicKey)).rejects.toThrow();
  });

  it('refuses payloads without the v2 marker', async () => {
    const identity = await generateIdentity();
    const { recoveryWrapKey } = await deriveRecoveryCredentials(await generateRecoverySecret());
    const wrapped = JSON.parse(await wrapPrivateKeyV2(identity.privateKey, recoveryWrapKey, 'u', identity.publicKey)) as Record<string, unknown>;
    const legacyShaped = JSON.stringify({ ciphertext: wrapped.ciphertext, nonce: wrapped.nonce });
    expect(isWrappedV2(legacyShaped)).toBe(false);
    await expect(unwrapPrivateKeyV2(legacyShaped, recoveryWrapKey, 'u', identity.publicKey)).rejects.toThrow();
  });
});

describe('legacy unwrap', () => {
  it('still opens legacy password and recovery wraps', async () => {
    const identity = await generateIdentity();
    const passwordWrap = await legacyPasswordWrap(identity.privateKey, 'old-password');
    const recoveryWrap = await wrapPrivateKeyWithRecoveryToken(identity.privateKey, 'legacy-token');

    expect(isWrappedV2(passwordWrap)).toBe(false);
    expect(Array.from(await unwrapPrivateKeyWithPassword(passwordWrap, 'old-password'))).toEqual(Array.from(identity.privateKey));
    expect(Array.from(await unwrapPrivateKeyWithRecoveryToken(recoveryWrap, 'legacy-token'))).toEqual(Array.from(identity.privateKey));
  });
});

describe('recovery file v2', () => {
  it('builds a JSON file that parses back to the same contents', async () => {
    const sodium = await getSodium();
    const secret = await generateRecoverySecret();
    const file = await buildRecoveryFile({ userId: 'user-1', nickname: 'Alice', secret });
    const text = decodeFile(file);

    expect(JSON.parse(text)).toEqual({
      type: 'sparkchat-recovery',
      version: 2,
      userId: 'user-1',
      nickname: 'Alice',
      secret: sodium.to_base64(secret),
    });
    const parsed = await parseRecoveryFile(text);
    expect(parsed.userId).toBe('user-1');
    expect(parsed.nickname).toBe('Alice');
    expect(Array.from(parsed.secret)).toEqual(Array.from(secret));
  });

  it('keeps non-ascii nicknames intact', async () => {
    const file = await buildRecoveryFile({ userId: 'u', nickname: 'Joãozinho', secret: await generateRecoverySecret() });
    expect((await parseRecoveryFile(decodeFile(file))).nickname).toBe('Joãozinho');
  });

  it.each([
    ['binary legacy content', '\u0000\u0001garbage'],
    ['empty object', '{}'],
    ['null', 'null'],
    ['wrong type', JSON.stringify({ type: 'other', version: 2, userId: 'u', nickname: 'n', secret: 'A'.repeat(43) })],
    ['wrong version', JSON.stringify({ type: 'sparkchat-recovery', version: 1, userId: 'u', nickname: 'n', secret: 'A'.repeat(43) })],
    ['missing user id', JSON.stringify({ type: 'sparkchat-recovery', version: 2, nickname: 'n', secret: 'A'.repeat(43) })],
    ['empty user id', JSON.stringify({ type: 'sparkchat-recovery', version: 2, userId: '', nickname: 'n', secret: 'A'.repeat(43) })],
    ['short secret', JSON.stringify({ type: 'sparkchat-recovery', version: 2, userId: 'u', nickname: 'n', secret: 'A'.repeat(42) })],
    ['secret with invalid alphabet', JSON.stringify({ type: 'sparkchat-recovery', version: 2, userId: 'u', nickname: 'n', secret: `${'A'.repeat(42)}+` })],
  ])('rejects %s', async (_label, text) => {
    await expect(parseRecoveryFile(text)).rejects.toBeInstanceOf(InvalidRecoveryFileError);
  });
});
