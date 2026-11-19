import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildInviteLink,
  createInviteBundle,
  deriveInviteProof,
  deriveInviteToken,
  hashInviteToken,
  hasInviteFragment,
  INVITE_SECRET_BYTES,
  openInviteSecret,
  parseInviteFragment,
  sealInviteSecret,
  verifyInviteProof,
} from './group-invite';

const ROOM_ID = '7b0c3f4e-2a51-4c1d-9d0e-5f6a7b8c9d0e';
const SECRET = Uint8Array.from({ length: 16 }, (_, index) => index);
const SIGNING_KEY = 'm9Zr3pQ_lXk2vH8sYt1wE4uC7nB0aJ6dF5gR2hT9yU0';
const KEY_ID = 'AAECAwQFBgcICQoLDA0ODw';

function nodeHmac(message: string, secret = SECRET): string {
  return createHmac('sha256', Buffer.from(secret)).update(message, 'utf8').digest('base64url');
}

describe('invite token and proof derivation', () => {
  it('derives the server token as base64url HMAC-SHA256 of the fixed label', async () => {
    const token = await deriveInviteToken(SECRET);
    expect(token).toBe(nodeHmac('sparkchat:invite-server:v1'));
    expect(token).toBe('08ZBBaeGjxQKroKEKwQvElUe6pzf28V0iEOAOSmAgMA');
  });

  it('hashes the token as lowercase sha256 hex of its text', async () => {
    const token = await deriveInviteToken(SECRET);
    const expected = createHash('sha256').update(token, 'utf8').digest('hex');
    expect(await hashInviteToken(token)).toBe(expected);
    expect(expected).toBe('c53658cc4e37a509c4f72c8216cbfd18ee362cd2b9041dd6ebf5720c708b660e');
  });

  it('derives the member proof over room id, joiner id and joiner signing key', async () => {
    const proof = await deriveInviteProof(SECRET, ROOM_ID, 'user-1', SIGNING_KEY);
    expect(proof).toBe(nodeHmac(`sparkchat:invite-proof:v1|${ROOM_ID}|user-1|${SIGNING_KEY}`));
    expect(proof).toBe('tBrAAqoUI-U-I6InKiwQEs3VOyCL-ZkqPRbvS8iiRwg');
  });

  it('rejects secrets of the wrong length and context values with the separator', async () => {
    await expect(deriveInviteToken(new Uint8Array(15))).rejects.toThrow();
    await expect(deriveInviteProof(SECRET, 'room|x', 'user-1', SIGNING_KEY)).rejects.toThrow();
  });
});

describe('invite proof verification', () => {
  it('accepts the proof made with the same secret, joiner and signing key', async () => {
    const proof = await deriveInviteProof(SECRET, ROOM_ID, 'user-1', SIGNING_KEY);
    expect(await verifyInviteProof(SECRET, ROOM_ID, 'user-1', SIGNING_KEY, proof)).toBe(true);
  });

  it.each([
    ['a wrong secret', async () => deriveInviteProof(new Uint8Array(16).fill(9), ROOM_ID, 'user-1', SIGNING_KEY)],
    ['another joiner', async () => deriveInviteProof(SECRET, ROOM_ID, 'user-2', SIGNING_KEY)],
    ['another signing key', async () => deriveInviteProof(SECRET, ROOM_ID, 'user-1', `${SIGNING_KEY.slice(0, -1)}1`)],
    ['another room', async () => deriveInviteProof(SECRET, 'other-room', 'user-1', SIGNING_KEY)],
    ['a missing proof', () => Promise.resolve(undefined)],
    ['an empty proof', () => Promise.resolve('')],
    ['a non string proof', () => Promise.resolve(42)],
    ['a truncated proof', async () => (await deriveInviteProof(SECRET, ROOM_ID, 'user-1', SIGNING_KEY)).slice(0, -2)],
  ])('rejects a proof made with %s', async (_label, makeProof) => {
    expect(await verifyInviteProof(SECRET, ROOM_ID, 'user-1', SIGNING_KEY, await makeProof())).toBe(false);
  });

  it('rejects when the verifier holds no valid secret', async () => {
    const proof = await deriveInviteProof(SECRET, ROOM_ID, 'user-1', SIGNING_KEY);
    expect(await verifyInviteProof(new Uint8Array(8), ROOM_ID, 'user-1', SIGNING_KEY, proof)).toBe(false);
  });
});

describe('encrypted invite', () => {
  const roomKey = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);

  it('uses the v2 field encoding and opens only with the same room, key id and key', async () => {
    const sealed = await sealInviteSecret(SECRET, roomKey, ROOM_ID, KEY_ID);
    expect(sealed.startsWith(`e2e:v2:${KEY_ID}:`)).toBe(true);
    expect(await openInviteSecret(sealed, roomKey, ROOM_ID, KEY_ID)).toEqual(SECRET);

    expect(await openInviteSecret(sealed, roomKey, 'other-room', KEY_ID)).toBeNull();
    expect(await openInviteSecret(sealed, roomKey, ROOM_ID, 'BAECAwQFBgcICQoLDA0ODw')).toBeNull();
    expect(await openInviteSecret(sealed, new Uint8Array(32), ROOM_ID, KEY_ID)).toBeNull();
    expect(await openInviteSecret(`${sealed.slice(0, -4)}AAAA`, roomKey, ROOM_ID, KEY_ID)).toBeNull();
    expect(await openInviteSecret('e2e:v2:short', roomKey, ROOM_ID, KEY_ID)).toBeNull();
  });

  it('binds the ad to the invite label, room id and key id', async () => {
    const sodium = await (await import('./sodium')).getSodium();
    const sealed = await sealInviteSecret(SECRET, roomKey, ROOM_ID, KEY_ID);
    const combined = sodium.from_base64(sealed.slice(`e2e:v2:${KEY_ID}:`.length));
    const nonceLength = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
    const opened = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      combined.subarray(nonceLength),
      new TextEncoder().encode(`sparkchat:invite:v1|${ROOM_ID}|${KEY_ID}`),
      combined.subarray(0, nonceLength),
      roomKey,
    );
    expect(opened).toEqual(SECRET);
  });

  it('creates a fresh secret and matching token hash for every bundle', async () => {
    const first = await createInviteBundle(roomKey, ROOM_ID, KEY_ID);
    const second = await createInviteBundle(roomKey, ROOM_ID, KEY_ID);
    expect(first.secret).toHaveLength(INVITE_SECRET_BYTES);
    expect(first.secret).not.toEqual(second.secret);
    expect(first.tokenHash).toBe(await hashInviteToken(await deriveInviteToken(first.secret)));
    expect(await openInviteSecret(first.encryptedInvite, roomKey, ROOM_ID, KEY_ID)).toEqual(first.secret);
  });
});

describe('invite link', () => {
  it('puts the room id and the secret only in the fragment of the app url', async () => {
    const link = await buildInviteLink('https://sparkchat.example', ROOM_ID, SECRET);
    expect(link).toBe(`https://sparkchat.example/app/#join=${ROOM_ID}.AAECAwQFBgcICQoLDA0ODw`);
    const url = new URL(link);
    expect(url.pathname).toBe('/app/');
    expect(url.search).toBe('');
  });

  it('round-trips through the fragment parser', async () => {
    const link = await buildInviteLink('https://sparkchat.example', ROOM_ID, SECRET);
    const parsed = await parseInviteFragment(new URL(link).hash);
    expect(parsed?.roomId).toBe(ROOM_ID);
    expect(parsed?.secret).toEqual(SECRET);
  });

  it.each([
    ['', 'no fragment'],
    ['#other=1', 'another fragment key'],
    ['#join=', 'an empty value'],
    [`#join=${ROOM_ID}`, 'a missing secret'],
    ['#join=.AAECAwQFBgcICQoLDA0ODw', 'a missing room id'],
    [`#join=${ROOM_ID}.AAECAwQFBgcICQoLDA0OD`, 'a short secret'],
    [`#join=${ROOM_ID}.AAECAwQFBgcICQoLDA0ODw==`, 'a padded secret'],
    [`#join=${ROOM_ID}.AAECAwQFBgcICQoLDA0OD+`, 'a non url-safe secret'],
    ['#join=bad%20room.AAECAwQFBgcICQoLDA0ODw', 'an invalid room id'],
  ])('rejects %s (%s)', async (hash) => {
    expect(await parseInviteFragment(hash)).toBeNull();
  });

  it('detects the invite fragment key', () => {
    expect(hasInviteFragment(`#join=${ROOM_ID}.x`)).toBe(true);
    expect(hasInviteFragment('#join=')).toBe(true);
    expect(hasInviteFragment('#other=1')).toBe(false);
    expect(hasInviteFragment('')).toBe(false);
  });
});
