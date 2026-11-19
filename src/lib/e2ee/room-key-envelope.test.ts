import { beforeAll, describe, expect, it } from 'vitest';
import {
  generateRoomKeyId,
  openRoomKeyEnvelope,
  RoomKeyEnvelopeError,
  sealRoomKeyEnvelope,
  type EnvelopeRejection,
  type OpenRoomKeyExpectations,
} from './room-key-envelope';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

interface Party {
  userId: string;
  publicKey: string;
  privateKey: Uint8Array;
  signingPublicKey: string;
  signingPrivateKey: Uint8Array;
}

async function createParty(userId: string): Promise<Party> {
  const sodium = await getSodium();
  const pair = sodium.crypto_box_keypair();
  const signing = await deriveSigningKeyPair(pair.privateKey);
  return {
    userId,
    publicKey: sodium.to_base64(pair.publicKey),
    privateKey: pair.privateKey,
    signingPublicKey: sodium.to_base64(signing.publicKey),
    signingPrivateKey: signing.privateKey,
  };
}

let alice: Party;
let bob: Party;
let mallory: Party;
let roomKey: Uint8Array;
let keyId: string;

beforeAll(async () => {
  [alice, bob, mallory] = await Promise.all([createParty('alice'), createParty('bob'), createParty('mallory')]);
  roomKey = crypto.getRandomValues(new Uint8Array(32));
  keyId = await generateRoomKeyId();
});

function sealFromAliceToBob(overrides: Partial<Parameters<typeof sealRoomKeyEnvelope>[0]> = {}): Promise<string> {
  return sealRoomKeyEnvelope({
    roomKey,
    roomId: 'room-1',
    keyId,
    epoch: 3,
    senderId: alice.userId,
    senderPrivateKey: alice.privateKey,
    senderSigningPrivateKey: alice.signingPrivateKey,
    recipientId: bob.userId,
    recipientPublicKey: bob.publicKey,
    ...overrides,
  });
}

function bobExpects(overrides: Partial<OpenRoomKeyExpectations> = {}): OpenRoomKeyExpectations {
  const pinned = new Map([
    [alice.userId, alice],
    [mallory.userId, mallory],
  ]);
  return {
    roomId: 'room-1',
    recipientId: bob.userId,
    recipientPublicKey: bob.publicKey,
    recipientPrivateKey: bob.privateKey,
    isMember: (userId) => userId === alice.userId || userId === bob.userId,
    resolveSender: (userId) => {
      const party = pinned.get(userId);
      return Promise.resolve(party ? { publicKey: party.publicKey, signingPublicKey: party.signingPublicKey } : null);
    },
    ...overrides,
  };
}

async function rejectionOf(sealed: string, expected: OpenRoomKeyExpectations): Promise<EnvelopeRejection | null> {
  try {
    await openRoomKeyEnvelope(sealed, expected);
    return null;
  } catch (error) {
    if (error instanceof RoomKeyEnvelopeError) {
      return error.reason;
    }
    throw error;
  }
}

function mutate(sealed: string, changes: Record<string, unknown>): string {
  return JSON.stringify({ ...(JSON.parse(sealed) as Record<string, unknown>), ...changes });
}

describe('room key envelope v2', () => {
  it('generates 16 byte key ids encoded as base64url without padding', async () => {
    const sodium = await getSodium();
    const generated = await generateRoomKeyId();
    expect(generated).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(sodium.from_base64(generated, sodium.base64_variants.URLSAFE_NO_PADDING)).toHaveLength(16);
  });

  it('has the exact v2 shape and a sender-identified box', async () => {
    const sealed = await sealFromAliceToBob();
    const parsed = JSON.parse(sealed) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['v', 'roomId', 'keyId', 'epoch', 'senderId', 'recipientId', 'nonce', 'box', 'sig']);
    expect(parsed).toMatchObject({ v: 2, roomId: 'room-1', keyId, epoch: 3, senderId: 'alice', recipientId: 'bob' });
  });

  it('signs the canonical header bytes defined by the spec', async () => {
    const sodium = await getSodium();
    const sealed = await sealFromAliceToBob();
    const parsed = JSON.parse(sealed) as Record<string, string>;
    const header = `sparkchat:room-key:v2\nroom-1\n${keyId}\n3\nalice\nbob\n${bob.publicKey}\n${parsed.nonce}\n${parsed.box}`;
    const valid = sodium.crypto_sign_verify_detached(
      sodium.from_base64(parsed.sig ?? ''),
      new TextEncoder().encode(header),
      sodium.from_base64(alice.signingPublicKey),
    );
    expect(valid).toBe(true);
  });

  it('opens an envelope from a pinned member addressed to itself', async () => {
    const opened = await openRoomKeyEnvelope(await sealFromAliceToBob(), bobExpects());
    expect(opened).toMatchObject({ roomId: 'room-1', keyId, epoch: 3, senderId: 'alice' });
    expect(Array.from(opened.roomKey)).toEqual(Array.from(roomKey));
  });

  it('rejects a bad signature', async () => {
    const sealed = await sealFromAliceToBob({ senderSigningPrivateKey: mallory.signingPrivateKey });
    expect(await rejectionOf(sealed, bobExpects())).toBe('bad-signature');
  });

  it('rejects a header changed after signing', async () => {
    const sealed = await sealFromAliceToBob();
    const other = JSON.parse(await sealFromAliceToBob()) as Record<string, unknown>;
    expect(await rejectionOf(mutate(sealed, { epoch: 4 }), bobExpects())).toBe('bad-signature');
    expect(await rejectionOf(mutate(sealed, { keyId: await generateRoomKeyId() }), bobExpects())).toBe('bad-signature');
    expect(await rejectionOf(mutate(sealed, { box: other.box }), bobExpects())).toBe('bad-signature');
  });

  it('rejects an envelope sealed for another public key of the same user id', async () => {
    const sealed = await sealFromAliceToBob({ recipientPublicKey: mallory.publicKey });
    expect(await rejectionOf(sealed, bobExpects())).toBe('bad-signature');
  });

  it('rejects a sender without a pinned signing key', async () => {
    const sealed = await sealFromAliceToBob();
    expect(await rejectionOf(sealed, bobExpects({ resolveSender: () => Promise.resolve(null) }))).toBe('unpinned-sender');
  });

  it('rejects an envelope that verifies with a different key than the pinned one', async () => {
    const sealed = await sealFromAliceToBob();
    const pinnedMallory = () => Promise.resolve({ publicKey: mallory.publicKey, signingPublicKey: mallory.signingPublicKey });
    expect(await rejectionOf(sealed, bobExpects({ resolveSender: pinnedMallory }))).toBe('bad-signature');
  });

  it('rejects an envelope addressed to someone else', async () => {
    const sealed = await sealFromAliceToBob({ recipientId: 'carol' });
    expect(await rejectionOf(sealed, bobExpects())).toBe('wrong-recipient');
  });

  it('rejects an envelope for another room', async () => {
    const sealed = await sealFromAliceToBob({ roomId: 'room-2' });
    expect(await rejectionOf(sealed, bobExpects())).toBe('wrong-room');
  });

  it('rejects a sender that is not a member in the local view', async () => {
    const sealed = await sealRoomKeyEnvelope({
      roomKey,
      roomId: 'room-1',
      keyId,
      epoch: 3,
      senderId: mallory.userId,
      senderPrivateKey: mallory.privateKey,
      senderSigningPrivateKey: mallory.signingPrivateKey,
      recipientId: bob.userId,
      recipientPublicKey: bob.publicKey,
    });
    expect(await rejectionOf(sealed, bobExpects())).toBe('non-member-sender');
  });

  it('rejects a box that the pinned sender key cannot open', async () => {
    const sodium = await getSodium();
    const sealed = await sealFromAliceToBob();
    const parsed = JSON.parse(sealed) as Record<string, string>;
    const forgedBox = sodium.to_base64(
      sodium.crypto_box_easy(roomKey, sodium.from_base64(parsed.nonce ?? ''), sodium.from_base64(bob.publicKey), mallory.privateKey),
    );
    const header = `sparkchat:room-key:v2\nroom-1\n${keyId}\n3\nalice\nbob\n${bob.publicKey}\n${parsed.nonce}\n${forgedBox}`;
    const sig = sodium.to_base64(sodium.crypto_sign_detached(new TextEncoder().encode(header), alice.signingPrivateKey));
    expect(await rejectionOf(mutate(sealed, { box: forgedBox, sig }), bobExpects())).toBe('bad-box');
  });

  it('rejects malformed envelopes', async () => {
    const sealed = await sealFromAliceToBob();
    const cases = [
      'not json',
      'null',
      mutate(sealed, { v: 1 }),
      mutate(sealed, { keyId: 'short' }),
      mutate(sealed, { epoch: 0 }),
      mutate(sealed, { epoch: 1.5 }),
      mutate(sealed, { epoch: '3' }),
      mutate(sealed, { senderId: '' }),
      mutate(sealed, { sig: 'AAAA' }),
    ];
    for (const value of cases) {
      expect(await rejectionOf(value, bobExpects())).toBe('malformed');
    }
  });
});
