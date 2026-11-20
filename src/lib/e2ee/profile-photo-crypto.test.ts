import { describe, expect, it } from 'vitest';
import { openAvatarFile, sealAvatarFile } from './attachment-crypto';
import {
  createProfileKeyEnvelope,
  deriveProfileKey,
  openProfileKeyEnvelope,
  openRoomPhotoPointer,
  openUserPhotoPointer,
  rewrapProfileKeyEnvelope,
  sealRoomPhotoPointer,
  sealUserPhotoPointer,
  unwrapProfileKeyEnvelope,
  type UserPhotoPointer,
} from './profile-photo-crypto';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

const USER_ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const OTHER_USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const ROOM_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const OTHER_ROOM_ID = '9b2d6b4e-3a63-4c56-8d76-1f1a8e3f7d21';
const KEY_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const NEXT_KEY_ID = 'BBBBBBBBBBBBBBBBBBBBBB';
const URL_VALUE = 'https://media.example.com/uploads/avatars/0d6c0c3e-5f2b-4f0e-9f59-3c8c6a1b2d4e.bin?e2e=1';

async function identityKeys(): Promise<{ privateKey: Uint8Array; signingPrivateKey: Uint8Array; signingPublicKey: string }> {
  const sodium = await getSodium();
  const privateKey = sodium.crypto_box_keypair().privateKey;
  const signing = await deriveSigningKeyPair(privateKey);
  return { privateKey, signingPrivateKey: signing.privateKey, signingPublicKey: sodium.to_base64(signing.publicKey) };
}

function randomKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function pointer(fileVersion: number): UserPhotoPointer {
  return { url: URL_VALUE, fileKey: 'a'.repeat(43), mime: 'image/webp', fileVersion };
}

describe('profile key derivation', () => {
  it('is deterministic per identity and version and differs across versions and identities', async () => {
    const alice = await identityKeys();
    const bob = await identityKeys();
    const first = await deriveProfileKey(alice.privateKey, 1);
    expect(first).toHaveLength(32);
    expect(Array.from(await deriveProfileKey(alice.privateKey, 1))).toEqual(Array.from(first));
    expect(Array.from(await deriveProfileKey(alice.privateKey, 2))).not.toEqual(Array.from(first));
    expect(Array.from(await deriveProfileKey(bob.privateKey, 1))).not.toEqual(Array.from(first));
  });

  it('rejects invalid versions', async () => {
    const alice = await identityKeys();
    await expect(deriveProfileKey(alice.privateKey, 0)).rejects.toThrow();
    await expect(deriveProfileKey(alice.privateKey, 1.5)).rejects.toThrow();
  });
});

describe('user photo pointer', () => {
  it('round trips with the profile key bound to the owner and version', async () => {
    const alice = await identityKeys();
    const key = await deriveProfileKey(alice.privateKey, 3);
    const sealed = await sealUserPhotoPointer(pointer(2), key, USER_ID, 3);
    expect(sealed).not.toContain(URL_VALUE);
    expect(sealed.length).toBeLessThan(1024);
    expect(await openUserPhotoPointer(sealed, key, USER_ID, 3)).toEqual(pointer(2));
  });

  it('fails with the wrong user, version or key', async () => {
    const alice = await identityKeys();
    const key = await deriveProfileKey(alice.privateKey, 1);
    const sealed = await sealUserPhotoPointer(pointer(1), key, USER_ID, 1);
    expect(await openUserPhotoPointer(sealed, key, OTHER_USER_ID, 1)).toBeNull();
    expect(await openUserPhotoPointer(sealed, key, USER_ID, 2)).toBeNull();
    expect(await openUserPhotoPointer(sealed, randomKey(), USER_ID, 1)).toBeNull();
    expect(await openUserPhotoPointer('garbage', key, USER_ID, 1)).toBeNull();
  });

  it('cannot be opened with the previous profile key after a version bump', async () => {
    const alice = await identityKeys();
    const oldKey = await deriveProfileKey(alice.privateKey, 1);
    const newKey = await deriveProfileKey(alice.privateKey, 2);
    const bumped = await sealUserPhotoPointer(pointer(1), newKey, USER_ID, 2);
    expect(await openUserPhotoPointer(bumped, oldKey, USER_ID, 2)).toBeNull();
    expect(await openUserPhotoPointer(bumped, oldKey, USER_ID, 1)).toBeNull();
    expect(await openUserPhotoPointer(bumped, newKey, USER_ID, 2)).toEqual(pointer(1));
  });

  it('refuses a file version newer than the pointer version and invalid pointers', async () => {
    const key = randomKey();
    await expect(sealUserPhotoPointer(pointer(3), key, USER_ID, 2)).rejects.toThrow();
    await expect(sealUserPhotoPointer({ ...pointer(1), mime: 'image/svg+xml' }, key, USER_ID, 1)).rejects.toThrow();
    await expect(sealUserPhotoPointer({ ...pointer(1), fileKey: 'short' }, key, USER_ID, 1)).rejects.toThrow();
  });
});

describe('room photo pointer', () => {
  it('round trips with the room key and is bound to the room and key id', async () => {
    const roomKey = randomKey();
    const value = { url: URL_VALUE, fileKey: 'b'.repeat(43), mime: 'image/jpeg' };
    const sealed = await sealRoomPhotoPointer(value, roomKey, ROOM_ID, KEY_ID);
    expect(sealed.startsWith(`e2e:v2:${KEY_ID}:`)).toBe(true);
    expect(await openRoomPhotoPointer(sealed, roomKey, ROOM_ID, KEY_ID)).toEqual(value);
    expect(await openRoomPhotoPointer(sealed, roomKey, OTHER_ROOM_ID, KEY_ID)).toBeNull();
    expect(await openRoomPhotoPointer(sealed, roomKey, ROOM_ID, NEXT_KEY_ID)).toBeNull();
    expect(await openRoomPhotoPointer(sealed, randomKey(), ROOM_ID, KEY_ID)).toBeNull();
  });
});

describe('profile key envelope', () => {
  async function envelopeFor(owner: Awaited<ReturnType<typeof identityKeys>>, roomKey: Uint8Array, version = 1) {
    const profileKey = await deriveProfileKey(owner.privateKey, version);
    const envelope = await createProfileKeyEnvelope({
      userId: USER_ID,
      roomId: ROOM_ID,
      version,
      profileKey,
      signingPrivateKey: owner.signingPrivateKey,
      roomKey,
      keyId: KEY_ID,
    });
    return { envelope, profileKey };
  }

  it('opens with the room key and the owner pinned signing key and fits the server limit', async () => {
    const alice = await identityKeys();
    const roomKey = randomKey();
    const { envelope, profileKey } = await envelopeFor(alice, roomKey, 4);
    expect(envelope.length).toBeLessThanOrEqual(512);
    const opened = await openProfileKeyEnvelope(envelope, {
      roomKey,
      roomId: ROOM_ID,
      keyId: KEY_ID,
      ownerId: USER_ID,
      expectedVersion: 4,
      ownerSigningPublicKey: alice.signingPublicKey,
    });
    expect(Array.from(opened?.profileKey ?? [])).toEqual(Array.from(profileKey));
    expect(opened?.version).toBe(4);
  });

  it('is rejected when it was signed by a different signer', async () => {
    const alice = await identityKeys();
    const mallory = await identityKeys();
    const roomKey = randomKey();
    const { envelope } = await envelopeFor(mallory, roomKey);
    expect(
      await openProfileKeyEnvelope(envelope, {
        roomKey,
        roomId: ROOM_ID,
        keyId: KEY_ID,
        ownerId: USER_ID,
        expectedVersion: 1,
        ownerSigningPublicKey: alice.signingPublicKey,
      }),
    ).toBeNull();
  });

  it('is rejected for another owner row, room, key id or version', async () => {
    const alice = await identityKeys();
    const roomKey = randomKey();
    const { envelope } = await envelopeFor(alice, roomKey, 2);
    const base = { roomKey, roomId: ROOM_ID, keyId: KEY_ID, ownerId: USER_ID, expectedVersion: 2, ownerSigningPublicKey: alice.signingPublicKey };
    expect(await openProfileKeyEnvelope(envelope, base)).not.toBeNull();
    expect(await openProfileKeyEnvelope(envelope, { ...base, ownerId: OTHER_USER_ID })).toBeNull();
    expect(await openProfileKeyEnvelope(envelope, { ...base, roomId: OTHER_ROOM_ID })).toBeNull();
    expect(await openProfileKeyEnvelope(envelope, { ...base, keyId: NEXT_KEY_ID })).toBeNull();
    expect(await openProfileKeyEnvelope(envelope, { ...base, expectedVersion: 3 })).toBeNull();
    expect(await openProfileKeyEnvelope(envelope, { ...base, roomKey: randomKey() })).toBeNull();
  });

  it('keeps the owner signature when re-wrapped with the next room key', async () => {
    const alice = await identityKeys();
    const oldRoomKey = randomKey();
    const newRoomKey = randomKey();
    const { envelope, profileKey } = await envelopeFor(alice, oldRoomKey);
    const rewrapped = await rewrapProfileKeyEnvelope(
      envelope,
      { roomKey: oldRoomKey, keyId: KEY_ID },
      { roomKey: newRoomKey, keyId: NEXT_KEY_ID },
      ROOM_ID,
      USER_ID,
    );
    expect(rewrapped?.startsWith(`e2e:v2:${NEXT_KEY_ID}:`)).toBe(true);
    const before = await unwrapProfileKeyEnvelope(envelope, oldRoomKey, ROOM_ID, KEY_ID, USER_ID);
    const after = await unwrapProfileKeyEnvelope(rewrapped ?? '', newRoomKey, ROOM_ID, NEXT_KEY_ID, USER_ID);
    expect(Array.from(after ?? [])).toEqual(Array.from(before ?? [1]));
    const opened = await openProfileKeyEnvelope(rewrapped ?? '', {
      roomKey: newRoomKey,
      roomId: ROOM_ID,
      keyId: NEXT_KEY_ID,
      ownerId: USER_ID,
      expectedVersion: 1,
      ownerSigningPublicKey: alice.signingPublicKey,
    });
    expect(Array.from(opened?.profileKey ?? [])).toEqual(Array.from(profileKey));
  });

  it('cannot be re-wrapped without the previous room key', async () => {
    const alice = await identityKeys();
    const { envelope } = await envelopeFor(alice, randomKey());
    expect(await rewrapProfileKeyEnvelope(envelope, { roomKey: randomKey(), keyId: KEY_ID }, { roomKey: randomKey(), keyId: NEXT_KEY_ID }, ROOM_ID, USER_ID)).toBeNull();
  });
});

describe('avatar file', () => {
  it('round trips only with the same owner binding', async () => {
    const plaintext = new Uint8Array([9, 8, 7, 6, 5]);
    const userBinding = { kind: 'user' as const, userId: USER_ID, version: 2 };
    const sealed = await sealAvatarFile(new Blob([plaintext]), userBinding);
    const ciphertext = await sealed.ciphertext.arrayBuffer();
    const opened = await openAvatarFile(ciphertext, sealed.key, userBinding, 'image/webp');
    expect(opened?.type).toBe('image/webp');
    expect(Array.from(new Uint8Array((await opened?.arrayBuffer()) ?? new ArrayBuffer(0)))).toEqual(Array.from(plaintext));
    expect(await openAvatarFile(ciphertext, sealed.key, { ...userBinding, version: 3 }, 'image/webp')).toBeNull();
    expect(await openAvatarFile(ciphertext, sealed.key, { ...userBinding, userId: OTHER_USER_ID }, 'image/webp')).toBeNull();
    expect(await openAvatarFile(ciphertext, sealed.key, { kind: 'room', roomId: USER_ID }, 'image/webp')).toBeNull();

    const roomSealed = await sealAvatarFile(new Blob([plaintext]), { kind: 'room', roomId: ROOM_ID });
    const roomCiphertext = await roomSealed.ciphertext.arrayBuffer();
    expect(await openAvatarFile(roomCiphertext, roomSealed.key, { kind: 'room', roomId: ROOM_ID }, 'image/jpeg')).not.toBeNull();
    expect(await openAvatarFile(roomCiphertext, roomSealed.key, { kind: 'room', roomId: OTHER_ROOM_ID }, 'image/jpeg')).toBeNull();
  });
});
