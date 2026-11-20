import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AttachmentNamespace from './attachment-crypto';
import type * as CryptoNamespace from './profile-photo-crypto';
import type { AppSocket, RoomSummary } from '@lib/socket';
import type * as CurrentIdentityNamespace from './current-identity';
import type * as ProfilePhotosNamespace from './profile-photos';

interface Generation {
  keyId: string;
  epoch: number;
  key: Uint8Array;
}

const roomKeyState = vi.hoisted(() => ({
  generations: new Map<string, Map<string, { keyId: string; epoch: number; key: Uint8Array }>>(),
  current: new Map<string, { keyId: string; epoch: number; key: Uint8Array }>(),
  signing: new Map<string, string>(),
  canRename: true,
  availableListeners: new Set<(roomId: string) => void>(),
  rotationListeners: new Set<(roomId: string, generation: { keyId: string; epoch: number; key: Uint8Array }) => void>(),
}));

vi.mock('@lib/i18n/app-i18n', () => ({
  translate: (key: string) => key,
  hasTranslation: (key: string) => key.startsWith('errors.profilePhoto.') || key === 'errors.upload.tooLarge',
}));

vi.mock('./room-keys', () => {
  const lookup = (roomId: string, keyId: string) => roomKeyState.generations.get(roomId)?.get(keyId)?.key ?? null;
  return {
    getRoomKeyGeneration: lookup,
    ensureRoomKeyGeneration: (_socket: unknown, roomId: string, keyId: string) => Promise.resolve(lookup(roomId, keyId)),
    getCurrentRoomKey: (roomId: string) => roomKeyState.current.get(roomId) ?? null,
    resolveSigningPublicKey: (_socket: unknown, userId: string) => Promise.resolve(roomKeyState.signing.get(userId) ?? null),
    canRenameGroup: () => Promise.resolve(roomKeyState.canRename),
    ensureRoomKeyForSending: (_socket: unknown, roomId: string) => {
      const generation = roomKeyState.current.get(roomId);
      return generation ? Promise.resolve(generation) : Promise.reject(new Error('missing'));
    },
    subscribeRoomKeyAvailable: (listener: (roomId: string) => void) => {
      roomKeyState.availableListeners.add(listener);
      return () => roomKeyState.availableListeners.delete(listener);
    },
    subscribeOwnRotation: (listener: (roomId: string, generation: { keyId: string; epoch: number; key: Uint8Array }) => void) => {
      roomKeyState.rotationListeners.add(listener);
      return () => roomKeyState.rotationListeners.delete(listener);
    },
  };
});

const KEY_ONE = 'AAAAAAAAAAAAAAAAAAAAAA';
const KEY_TWO = 'BBBBBBBBBBBBBBBBBBBBBB';
const MEDIA = 'https://media.example.com/uploads/avatars';
const PLAINTEXT = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

type Handler = (payload: unknown) => void;

class FakeSocket {
  private readonly handlers = new Map<string, Set<Handler>>();
  readonly emitted: { event: string; payload: Record<string, unknown> }[] = [];

  on(event: string, handler: Handler) {
    const bucket = this.handlers.get(event) ?? new Set<Handler>();
    bucket.add(handler);
    this.handlers.set(event, bucket);
    return this;
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  emit(event: string, payload: Record<string, unknown>) {
    this.emitted.push({ event, payload });
    return this;
  }

  receive(event: string, payload: unknown) {
    for (const handler of Array.from(this.handlers.get(event) ?? [])) {
      handler(payload);
    }
  }

  emittedOf(event: string): Record<string, unknown>[] {
    return this.emitted.filter((entry) => entry.event === event).map((entry) => entry.payload);
  }

  asAppSocket(): AppSocket {
    return this as unknown as AppSocket;
  }
}

interface Person {
  userId: string;
  privateKey: Uint8Array;
  publicKey: string;
  signingPrivateKey: Uint8Array;
  signingPublicKey: string;
}

const files = new Map<string, ArrayBuffer>();
let photos: typeof ProfilePhotosNamespace;
let identity: typeof CurrentIdentityNamespace;
let crypto: typeof CryptoNamespace;
let attachments: typeof AttachmentNamespace;
let socket: FakeSocket;
let createdBlobs: Map<string, Blob>;
let revoked: string[];

async function person(userId: string): Promise<Person> {
  const { getSodium } = await import('./sodium');
  const { deriveSigningKeyPair } = await import('./signing');
  const sodium = await getSodium();
  const pair = sodium.crypto_box_keypair();
  const signing = await deriveSigningKeyPair(pair.privateKey);
  return {
    userId,
    privateKey: pair.privateKey,
    publicKey: sodium.to_base64(pair.publicKey),
    signingPrivateKey: signing.privateKey,
    signingPublicKey: sodium.to_base64(signing.publicKey),
  };
}

function setGeneration(roomId: string, generation: Generation, current = true): void {
  const forRoom = roomKeyState.generations.get(roomId) ?? new Map<string, Generation>();
  forRoom.set(generation.keyId, generation);
  roomKeyState.generations.set(roomId, forRoom);
  if (current) {
    roomKeyState.current.set(roomId, generation);
  }
}

function newGeneration(keyId: string, epoch: number): Generation {
  return { keyId, epoch, key: globalThis.crypto.getRandomValues(new Uint8Array(32)) };
}

interface PublishedPhoto {
  url: string;
  encryptedAvatar: string;
  fileKey: string;
}

async function publishUserPhoto(owner: Person, version: number, fileVersion = version): Promise<PublishedPhoto> {
  const url = `${MEDIA}/${owner.userId}-${fileVersion}.bin`;
  const sealed = await attachments.sealAvatarFile(new Blob([PLAINTEXT]), { kind: 'user', userId: owner.userId, version: fileVersion });
  files.set(url, await sealed.ciphertext.arrayBuffer());
  const profileKey = await crypto.deriveProfileKey(owner.privateKey, version);
  const encryptedAvatar = await crypto.sealUserPhotoPointer({ url, fileKey: sealed.key, mime: 'image/webp', fileVersion }, profileKey, owner.userId, version);
  return { url, encryptedAvatar, fileKey: sealed.key };
}

async function envelopeOf(owner: Person, roomId: string, generation: Generation, version: number, signer: Person = owner): Promise<string> {
  return crypto.createProfileKeyEnvelope({
    userId: owner.userId,
    roomId,
    version,
    profileKey: await crypto.deriveProfileKey(owner.privateKey, version),
    signingPrivateKey: signer.signingPrivateKey,
    roomKey: generation.key,
    keyId: generation.keyId,
  });
}

function summary(roomId: string, type: 'private' | 'group', participants: Record<string, unknown>[], extra: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id: roomId,
    type,
    participants,
    lastMessage: null,
    unreadCount: 0,
    mentionCount: 0,
    blockedBy: {},
    isBlockedBy: false,
    userBlocked: false,
    isMutuallyBlocked: false,
    ...extra,
  } as unknown as RoomSummary;
}

async function settle(): Promise<void> {
  for (let round = 0; round < 30; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function bytesOfUrl(url: string | null): Promise<number[]> {
  const blob = url ? createdBlobs.get(url) : undefined;
  return blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : [];
}

beforeEach(async () => {
  vi.resetModules();
  files.clear();
  roomKeyState.generations.clear();
  roomKeyState.current.clear();
  roomKeyState.signing.clear();
  roomKeyState.canRename = true;
  roomKeyState.availableListeners.clear();
  roomKeyState.rotationListeners.clear();
  createdBlobs = new Map();
  revoked = [];
  let counter = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    counter += 1;
    const url = `blob:test/${counter}`;
    createdBlobs.set(url, blob as Blob);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
    revoked.push(url);
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const body = files.get(url);
      return Promise.resolve(body ? new Response(body.slice(0), { status: 200 }) : new Response(null, { status: 404 }));
    }),
  );
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  identity = await import('./current-identity');
  photos = await import('./profile-photos');
  crypto = await import('./profile-photo-crypto');
  attachments = await import('./attachment-crypto');
  socket = new FakeSocket();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function signIn(me: Person): void {
  identity.setCurrentIdentity({ userId: me.userId, publicKey: me.publicKey, privateKey: me.privateKey });
  photos.attachProfilePhotoSocket(socket.asAppSocket());
  photos.applyRoomSummaries([]);
}

describe('contact photos', () => {
  async function dmWithAlice(options: { signer?: 'alice' | 'mallory'; participantVersion?: number } = {}) {
    const bob = await person('bob');
    const alice = await person('alice');
    const mallory = await person('mallory');
    const generation = newGeneration(KEY_ONE, 1);
    setGeneration('dm', generation);
    roomKeyState.signing.set('alice', alice.signingPublicKey);
    const photo = await publishUserPhoto(alice, 1);
    const envelope = await envelopeOf(alice, 'dm', generation, 1, options.signer === 'mallory' ? mallory : alice);
    signIn(bob);
    photos.applyRoomSummary(
      summary('dm', 'private', [
        { id: 'bob', encryptedAvatar: null, profileKeyVersion: 1, profileKeyEnvelope: null },
        { id: 'alice', encryptedAvatar: photo.encryptedAvatar, profileKeyVersion: options.participantVersion ?? 1, profileKeyEnvelope: { envelope, keyId: KEY_ONE } },
      ]),
    );
    return { bob, alice, photo, generation };
  }

  it('decrypts a contact photo through the signed envelope and exposes it for the private room', async () => {
    await dmWithAlice();
    photos.retainRoomPhoto('dm');
    await settle();

    const url = photos.getUserPhotoUrl('alice');
    expect(url).toMatch(/^blob:test\//);
    expect(photos.getRoomPhotoUrl('dm')).toBe(url);
    expect(await bytesOfUrl(url)).toEqual(Array.from(PLAINTEXT));
  });

  it('ignores an envelope signed by somebody other than the pinned owner key', async () => {
    await dmWithAlice({ signer: 'mallory' });
    photos.retainUserPhoto('alice');
    await settle();
    expect(photos.getUserPhotoUrl('alice')).toBeNull();
    expect(photos.getRoomPhotoUrl('dm')).toBeNull();
  });

  it('ignores an envelope whose version differs from the participant version', async () => {
    await dmWithAlice({ participantVersion: 2 });
    photos.retainUserPhoto('alice');
    await settle();
    expect(photos.getUserPhotoUrl('alice')).toBeNull();
  });

  it('falls back to null when the photo cannot be downloaded', async () => {
    const { photo } = await dmWithAlice();
    files.delete(photo.url);
    photos.retainUserPhoto('alice');
    await settle();
    expect(photos.getUserPhotoUrl('alice')).toBeNull();
  });

  it('never fetches a pointer that leaves the avatar storage', async () => {
    const bob = await person('bob');
    const alice = await person('alice');
    const generation = newGeneration(KEY_ONE, 1);
    setGeneration('dm', generation);
    roomKeyState.signing.set('alice', alice.signingPublicKey);
    const profileKey = await crypto.deriveProfileKey(alice.privateKey, 1);
    const encryptedAvatar = await crypto.sealUserPhotoPointer(
      { url: 'https://tracker.example.com/pixel.png', fileKey: 'c'.repeat(43), mime: 'image/png', fileVersion: 1 },
      profileKey,
      'alice',
      1,
    );
    signIn(bob);
    photos.applyRoomSummary(
      summary('dm', 'private', [
        { id: 'bob' },
        { id: 'alice', encryptedAvatar, profileKeyVersion: 1, profileKeyEnvelope: { envelope: await envelopeOf(alice, 'dm', generation, 1), keyId: KEY_ONE } },
      ]),
    );
    photos.retainUserPhoto('alice');
    await settle();
    expect(photos.getUserPhotoUrl('alice')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the old photo and switches to the new one when the new envelope arrives after the pointer', async () => {
    const { alice, generation } = await dmWithAlice();
    photos.retainUserPhoto('alice');
    await settle();
    const oldUrl = photos.getUserPhotoUrl('alice');
    expect(oldUrl).not.toBeNull();

    const next = await publishUserPhoto(alice, 2);
    photos.handleUserAvatarUpdated({ userId: 'alice', encryptedAvatar: next.encryptedAvatar, profileKeyVersion: 2 });
    await settle();
    expect(photos.getUserPhotoUrl('alice')).toBe(oldUrl);

    photos.handleProfileKeysUpdated({ roomId: 'dm', keyId: KEY_ONE, envelopes: { alice: await envelopeOf(alice, 'dm', generation, 2) } });
    await settle();
    const newUrl = photos.getUserPhotoUrl('alice');
    expect(newUrl).not.toBeNull();
    expect(newUrl).not.toBe(oldUrl);
  });

  it('drops the photo as soon as the contact removes it and revokes the object URL', async () => {
    await dmWithAlice();
    photos.retainUserPhoto('alice');
    await settle();
    const url = photos.getUserPhotoUrl('alice');
    expect(url).not.toBeNull();

    photos.handleUserAvatarUpdated({ userId: 'alice', encryptedAvatar: null, profileKeyVersion: 1 });
    expect(photos.getUserPhotoUrl('alice')).toBeNull();
    expect(revoked).toContain(url);
  });

  it('never resolves a photo for SparkAI', async () => {
    const bob = await person('bob');
    signIn(bob);
    photos.applyRoomSummary(summary('ai', 'private', [{ id: 'bob' }, { id: 'spark-ai', encryptedAvatar: 'e2e:pp1:AAAA', profileKeyVersion: 1 }]));
    photos.retainRoomPhoto('ai');
    await settle();
    expect(photos.getRoomPhotoUrl('ai')).toBeNull();
  });

  it('clears every decrypted photo when the identity is cleared on logout', async () => {
    await dmWithAlice();
    photos.retainUserPhoto('alice');
    await settle();
    const url = photos.getUserPhotoUrl('alice');
    expect(photos.getProfilePhotoCacheSize()).toBe(1);

    const changes: string[] = [];
    photos.subscribeProfilePhotos((change) => changes.push(change.kind));
    identity.setCurrentIdentity(null);

    expect(photos.getUserPhotoUrl('alice')).toBeNull();
    expect(photos.getProfilePhotoCacheSize()).toBe(0);
    expect(revoked).toContain(url);
    expect(changes).toContain('reset');
  });
});

describe('own photo', () => {
  it('opens its own pointer without any envelope', async () => {
    const bob = await person('bob');
    const photo = await publishUserPhoto(bob, 3);
    signIn(bob);
    photos.applySelfUser({ id: 'bob', encryptedAvatar: photo.encryptedAvatar, profileKeyVersion: 3 });
    photos.retainUserPhoto('bob');
    await settle();
    expect(await bytesOfUrl(photos.getUserPhotoUrl('bob'))).toEqual(Array.from(PLAINTEXT));
  });

  it('publishes its envelope to rooms that lack it, skipping rooms with SparkAI or with someone it blocked', async () => {
    const bob = await person('bob');
    const photo = await publishUserPhoto(bob, 1);
    for (const roomId of ['dm', 'ai', 'blocked']) {
      setGeneration(roomId, newGeneration(roomId === 'dm' ? KEY_ONE : KEY_TWO, 1));
    }
    signIn(bob);
    const me = { id: 'bob', encryptedAvatar: photo.encryptedAvatar, profileKeyVersion: 1, profileKeyEnvelope: null };
    photos.applyRoomSummary(summary('dm', 'private', [me, { id: 'alice' }]));
    photos.applyRoomSummary(summary('ai', 'private', [me, { id: 'spark-ai' }]));
    photos.applyRoomSummary(summary('blocked', 'private', [me, { id: 'mallory' }], { blockedBy: { mallory: 'bob' } }));
    await settle();

    const published = socket.emittedOf('room:publish-profile-key');
    expect(published.map((entry) => entry.roomId)).toEqual(['dm']);
    const [entry] = published;
    const opened = await crypto.openProfileKeyEnvelope(entry?.envelope as string, {
      roomKey: roomKeyState.current.get('dm')?.key as Uint8Array,
      roomId: 'dm',
      keyId: KEY_ONE,
      ownerId: 'bob',
      expectedVersion: 1,
      ownerSigningPublicKey: bob.signingPublicKey,
    });
    expect(Array.from(opened?.profileKey ?? [])).toEqual(Array.from(await crypto.deriveProfileKey(bob.privateKey, 1)));

    photos.applyRoomSummary(summary('dm', 'private', [me, { id: 'alice' }]));
    await settle();
    expect(socket.emittedOf('room:publish-profile-key')).toHaveLength(2);
    photos.handleProfileKeysUpdated({ roomId: 'dm', keyId: KEY_ONE, envelopes: { bob: entry?.envelope } });
    await settle();
    expect(socket.emittedOf('room:publish-profile-key')).toHaveLength(2);
  });

  it('shows the uploaded photo right away and resolves once the server echoes it', async () => {
    const bob = await person('bob');
    signIn(bob);
    const upload = photos.publishMyPhoto({ url: `${MEDIA}/new.bin`, fileKey: 'd'.repeat(43), mime: 'image/webp' }, 2, new Blob([PLAINTEXT], { type: 'image/webp' }));
    await settle();

    const [sent] = socket.emittedOf('user:set-avatar');
    expect(sent).toMatchObject({ url: `${MEDIA}/new.bin`, profileKeyVersion: 2 });
    expect(await bytesOfUrl(photos.getUserPhotoUrl('bob'))).toEqual(Array.from(PLAINTEXT));

    socket.receive('user:avatar-updated', { userId: 'bob', encryptedAvatar: sent?.encryptedAvatar, profileKeyVersion: 2 });
    await expect(upload).resolves.toBeUndefined();
  });

  it('rejects with a translatable code when the server refuses the photo', async () => {
    const bob = await person('bob');
    signIn(bob);
    const upload = photos.publishMyPhoto({ url: `${MEDIA}/new.bin`, fileKey: 'd'.repeat(43), mime: 'image/webp' }, 2, new Blob([PLAINTEXT], { type: 'image/webp' }));
    await settle();
    socket.receive('error', { message: 'nope', code: 'avatar.unknownCode', event: 'user:set-avatar' });
    await expect(upload).rejects.toMatchObject({ code: 'profilePhoto.failed' });
  });

  it('rejects without an identity', async () => {
    photos.attachProfilePhotoSocket(socket.asAppSocket());
    await expect(photos.clearMyPhoto()).rejects.toMatchObject({ code: 'profilePhoto.unavailable' });
  });

  it('bumps the profile key version when blocking and republishes only where the blocked user is absent', async () => {
    const bob = await person('bob');
    const photo = await publishUserPhoto(bob, 1);
    setGeneration('dm', newGeneration(KEY_ONE, 1));
    setGeneration('group', newGeneration(KEY_TWO, 1));
    setGeneration('shared', newGeneration(KEY_TWO, 1));
    signIn(bob);
    const me = { id: 'bob', encryptedAvatar: photo.encryptedAvatar, profileKeyVersion: 1 };
    photos.applyRoomSummary(summary('dm', 'private', [me, { id: 'mallory' }]));
    photos.applyRoomSummary(summary('group', 'group', [me, { id: 'carol' }]));
    photos.applyRoomSummary(summary('shared', 'group', [me, { id: 'carol' }, { id: 'mallory' }]));
    await settle();
    expect(socket.emittedOf('room:publish-profile-key').map((entry) => entry.roomId).sort()).toEqual(['dm', 'group', 'shared']);
    socket.emitted.length = 0;

    photos.handleBlockStatus({ roomId: 'dm', blockedUserId: 'mallory', blockedBy: { mallory: 'bob' }, isBlocking: true });
    await settle();

    const [sent] = socket.emittedOf('user:set-avatar');
    expect(sent).toMatchObject({ url: photo.url, profileKeyVersion: 2 });
    const oldKey = await crypto.deriveProfileKey(bob.privateKey, 1);
    const newKey = await crypto.deriveProfileKey(bob.privateKey, 2);
    expect(await crypto.openUserPhotoPointer(sent?.encryptedAvatar as string, oldKey, 'bob', 2)).toBeNull();
    expect(await crypto.openUserPhotoPointer(sent?.encryptedAvatar as string, newKey, 'bob', 2)).toMatchObject({ url: photo.url, fileVersion: 1 });
    expect(socket.emittedOf('room:publish-profile-key')).toHaveLength(0);

    socket.receive('user:avatar-updated', { userId: 'bob', encryptedAvatar: sent?.encryptedAvatar, profileKeyVersion: 2 });
    await settle();
    expect(socket.emittedOf('room:publish-profile-key').map((entry) => entry.roomId)).toEqual(['group']);

    photos.retainUserPhoto('bob');
    await settle();
    expect(await bytesOfUrl(photos.getUserPhotoUrl('bob'))).toEqual(Array.from(PLAINTEXT));
  });

  it('keeps its profile key when somebody else blocks it', async () => {
    const bob = await person('bob');
    const photo = await publishUserPhoto(bob, 1);
    setGeneration('dm', newGeneration(KEY_ONE, 1));
    setGeneration('group', newGeneration(KEY_TWO, 1));
    signIn(bob);
    const me = { id: 'bob', encryptedAvatar: photo.encryptedAvatar, profileKeyVersion: 1 };
    photos.applyRoomSummary(summary('dm', 'private', [me, { id: 'mallory' }]));
    photos.applyRoomSummary(summary('group', 'group', [me, { id: 'mallory' }]));
    await settle();
    socket.emitted.length = 0;

    photos.handleBlockStatus({ roomId: 'dm', blockedByUserId: 'mallory', blockedBy: { bob: 'mallory' }, isBlocking: false });
    await settle();

    expect(socket.emittedOf('user:set-avatar')).toHaveLength(0);
    expect(photos.isRoomBlocked('dm')).toBe(true);
    photos.applyRoomSummary(summary('group', 'group', [me, { id: 'mallory' }, { id: 'carol' }]));
    await settle();
    expect(socket.emittedOf('user:set-avatar')).toHaveLength(0);
  });

  it('republishes into the private room after unblocking', async () => {
    const bob = await person('bob');
    const photo = await publishUserPhoto(bob, 1);
    setGeneration('dm', newGeneration(KEY_ONE, 1));
    signIn(bob);
    const me = { id: 'bob', encryptedAvatar: photo.encryptedAvatar, profileKeyVersion: 1 };
    photos.applyRoomSummary(summary('dm', 'private', [me, { id: 'mallory' }], { blockedBy: { mallory: 'bob' } }));
    await settle();
    expect(socket.emittedOf('room:publish-profile-key')).toHaveLength(0);

    photos.handleBlockStatus({ roomId: 'dm', blockedUserId: 'mallory', blockedBy: {}, isBlocking: true });
    await settle();
    expect(socket.emittedOf('user:set-avatar')).toHaveLength(0);
    expect(socket.emittedOf('room:publish-profile-key').map((entry) => entry.roomId)).toEqual(['dm']);
  });

  it('waits for the whole room list before publishing and never publishes into a group with someone it blocked', async () => {
    const bob = await person('bob');
    const photo = await publishUserPhoto(bob, 2);
    setGeneration('group', newGeneration(KEY_ONE, 1));
    setGeneration('dm', newGeneration(KEY_TWO, 1));
    setGeneration('other', newGeneration(KEY_TWO, 1));
    identity.setCurrentIdentity({ userId: bob.userId, publicKey: bob.publicKey, privateKey: bob.privateKey });
    photos.attachProfilePhotoSocket(socket.asAppSocket());
    const me = { id: 'bob', encryptedAvatar: photo.encryptedAvatar, profileKeyVersion: 2 };

    photos.applyRoomSummary(summary('other', 'group', [me, { id: 'carol' }]));
    await settle();
    expect(socket.emittedOf('room:publish-profile-key')).toHaveLength(0);

    photos.applyRoomSummaries([
      summary('group', 'group', [me, { id: 'carol' }, { id: 'mallory' }]),
      summary('other', 'group', [me, { id: 'carol' }]),
      summary('dm', 'private', [me, { id: 'mallory' }], { blockedBy: { mallory: 'bob' } }),
    ]);
    await settle();
    expect(socket.emittedOf('room:publish-profile-key').map((entry) => entry.roomId)).toEqual(['other']);

    photos.forgetRoom('dm');
    photos.applyRoomParticipants('group', [{ id: 'bob' }, { id: 'carol' }, { id: 'mallory' }, { id: 'dave' }] as never);
    await settle();
    expect(socket.emittedOf('room:publish-profile-key').map((entry) => entry.roomId)).toEqual(['other']);
  });

  it('rejects and rolls back the optimistic photo when the server never confirms', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const bob = await person('bob');
      signIn(bob);
      const upload = photos.publishMyPhoto({ url: `${MEDIA}/new.bin`, fileKey: 'd'.repeat(43), mime: 'image/webp' }, 2, new Blob([PLAINTEXT], { type: 'image/webp' }));
      const outcome = upload.catch((error: unknown) => error);
      for (let round = 0; round < 30; round += 1) {
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(socket.emittedOf('user:set-avatar')).toHaveLength(1);
      expect(photos.getUserPhotoUrl('bob')).not.toBeNull();

      await vi.advanceTimersByTimeAsync(10000);

      expect(await outcome).toMatchObject({ code: 'profilePhoto.failed' });
      expect(photos.getUserPhotoUrl('bob')).toBeNull();
      expect(photos.nextProfileKeyVersion()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends one avatar change at a time so a rotation error is not blamed on the upload', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bob = await person('bob');
    const photo = await publishUserPhoto(bob, 1);
    setGeneration('dm', newGeneration(KEY_ONE, 1));
    signIn(bob);
    const me = { id: 'bob', encryptedAvatar: photo.encryptedAvatar, profileKeyVersion: 1 };
    photos.applyRoomSummary(summary('dm', 'private', [me, { id: 'mallory' }]));
    await settle();

    photos.handleBlockStatus({ roomId: 'dm', blockedUserId: 'mallory', blockedBy: { mallory: 'bob' }, isBlocking: true });
    await settle();
    expect(socket.emittedOf('user:set-avatar')).toHaveLength(1);

    const upload = photos.publishMyPhoto({ url: `${MEDIA}/new.bin`, fileKey: 'd'.repeat(43), mime: 'image/webp' }, 3, new Blob([PLAINTEXT], { type: 'image/webp' }));
    await settle();
    expect(socket.emittedOf('user:set-avatar')).toHaveLength(1);

    socket.receive('error', { message: 'nope', code: 'avatar.unknownCode', event: 'user:set-avatar' });
    await settle();
    expect(consoleError).toHaveBeenCalled();
    const sent = socket.emittedOf('user:set-avatar');
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ url: `${MEDIA}/new.bin`, profileKeyVersion: 3 });

    socket.receive('user:avatar-updated', { userId: 'bob', encryptedAvatar: sent[1]?.encryptedAvatar, profileKeyVersion: 3 });
    await expect(upload).resolves.toBeUndefined();
  });
});

describe('rotation performed by this client', () => {
  it('re-seals the group photo and re-wraps the envelopes it can verify, keeping the owner signatures', async () => {
    const bob = await person('bob');
    const alice = await person('alice');
    const mallory = await person('mallory');
    const oldGeneration = newGeneration(KEY_ONE, 1);
    setGeneration('group', oldGeneration);
    roomKeyState.signing.set('alice', alice.signingPublicKey);
    roomKeyState.signing.set('carol', mallory.signingPublicKey);
    const groupUrl = `${MEDIA}/group.bin`;
    const groupPointer = { url: groupUrl, fileKey: 'e'.repeat(43), mime: 'image/jpeg' };
    const encryptedGroupAvatar = await crypto.sealRoomPhotoPointer(groupPointer, oldGeneration.key, 'group', KEY_ONE);
    const alicePhoto = await publishUserPhoto(alice, 1);
    const carol = await person('carol');
    const carolPhoto = await publishUserPhoto(carol, 1);
    signIn(bob);
    photos.applyRoomSummary(
      summary(
        'group',
        'group',
        [
          { id: 'bob', encryptedAvatar: null, profileKeyVersion: 1 },
          { id: 'alice', encryptedAvatar: alicePhoto.encryptedAvatar, profileKeyVersion: 1, profileKeyEnvelope: { envelope: await envelopeOf(alice, 'group', oldGeneration, 1), keyId: KEY_ONE } },
          { id: 'carol', encryptedAvatar: carolPhoto.encryptedAvatar, profileKeyVersion: 1, profileKeyEnvelope: { envelope: await envelopeOf(carol, 'group', oldGeneration, 1), keyId: KEY_ONE } },
        ],
        { encryptedAvatar: { encryptedAvatar: encryptedGroupAvatar, keyId: KEY_ONE } },
      ),
    );
    await settle();

    const newGen = newGeneration(KEY_TWO, 2);
    setGeneration('group', newGen);
    for (const listener of Array.from(roomKeyState.rotationListeners)) {
      listener('group', newGen);
    }
    await settle();

    const [avatar] = socket.emittedOf('room:set-avatar');
    expect(avatar).toMatchObject({ roomId: 'group', url: groupUrl, keyId: KEY_TWO });
    expect(await crypto.openRoomPhotoPointer(avatar?.encryptedAvatar as string, newGen.key, 'group', KEY_TWO)).toEqual(groupPointer);

    const [rewrap] = socket.emittedOf('room:rewrap-profile-keys');
    const envelopes = rewrap?.envelopes as Record<string, string>;
    expect(rewrap).toMatchObject({ roomId: 'group', keyId: KEY_TWO });
    expect(Object.keys(envelopes)).toEqual(['alice']);
    const opened = await crypto.openProfileKeyEnvelope(envelopes.alice ?? '', {
      roomKey: newGen.key,
      roomId: 'group',
      keyId: KEY_TWO,
      ownerId: 'alice',
      expectedVersion: 1,
      ownerSigningPublicKey: alice.signingPublicKey,
    });
    expect(Array.from(opened?.profileKey ?? [])).toEqual(Array.from(await crypto.deriveProfileKey(alice.privateKey, 1)));
  });
});

describe('group photo', () => {
  it('uploads with the current room key and refuses members without rename permission', async () => {
    const bob = await person('bob');
    const generation = newGeneration(KEY_ONE, 1);
    setGeneration('group', generation);
    signIn(bob);
    photos.applyRoomSummary(summary('group', 'group', [{ id: 'bob' }, { id: 'alice' }]));
    const pointer = { url: `${MEDIA}/g.bin`, fileKey: 'f'.repeat(43), mime: 'image/webp' };

    const upload = photos.publishRoomPhoto('group', pointer, new Blob([PLAINTEXT], { type: 'image/webp' }));
    await settle();
    const [sent] = socket.emittedOf('room:set-avatar');
    expect(sent).toMatchObject({ roomId: 'group', url: pointer.url, keyId: KEY_ONE });
    expect(await crypto.openRoomPhotoPointer(sent?.encryptedAvatar as string, generation.key, 'group', KEY_ONE)).toEqual(pointer);
    expect(photos.getRoomPhotoUrl('group')).toMatch(/^blob:test\//);
    socket.receive('room:avatar-updated', { roomId: 'group', encryptedAvatar: sent?.encryptedAvatar, keyId: KEY_ONE });
    await expect(upload).resolves.toBeUndefined();

    roomKeyState.canRename = false;
    await expect(photos.publishRoomPhoto('group', pointer, new Blob([PLAINTEXT]))).rejects.toMatchObject({ code: 'profilePhoto.notAllowed' });
  });

  it('decrypts a group photo sealed by another member and clears it when removed', async () => {
    const bob = await person('bob');
    const generation = newGeneration(KEY_ONE, 1);
    setGeneration('group', generation);
    const url = `${MEDIA}/group-photo.bin`;
    const sealed = await attachments.sealAvatarFile(new Blob([PLAINTEXT]), { kind: 'room', roomId: 'group' });
    files.set(url, await sealed.ciphertext.arrayBuffer());
    const encryptedAvatar = await crypto.sealRoomPhotoPointer({ url, fileKey: sealed.key, mime: 'image/webp' }, generation.key, 'group', KEY_ONE);
    signIn(bob);
    photos.applyRoomSummary(summary('group', 'group', [{ id: 'bob' }, { id: 'alice' }]));
    photos.retainRoomPhoto('group');
    photos.handleRoomAvatarUpdated({ roomId: 'group', encryptedAvatar, keyId: KEY_ONE });
    await settle();
    expect(await bytesOfUrl(photos.getRoomPhotoUrl('group'))).toEqual(Array.from(PLAINTEXT));

    photos.handleRoomAvatarUpdated({ roomId: 'group', encryptedAvatar: null, keyId: null });
    expect(photos.getRoomPhotoUrl('group')).toBeNull();
  });

  it('refuses a group photo pointer copied from another room', async () => {
    const bob = await person('bob');
    const generation = newGeneration(KEY_ONE, 1);
    setGeneration('group', generation);
    setGeneration('other', generation);
    const url = `${MEDIA}/copied.bin`;
    const sealed = await attachments.sealAvatarFile(new Blob([PLAINTEXT]), { kind: 'room', roomId: 'other' });
    files.set(url, await sealed.ciphertext.arrayBuffer());
    const encryptedAvatar = await crypto.sealRoomPhotoPointer({ url, fileKey: sealed.key, mime: 'image/webp' }, generation.key, 'other', KEY_ONE);
    signIn(bob);
    photos.applyRoomSummary(summary('group', 'group', [{ id: 'bob' }], { encryptedAvatar: { encryptedAvatar, keyId: KEY_ONE } }));
    photos.retainRoomPhoto('group');
    await settle();
    expect(photos.getRoomPhotoUrl('group')).toBeNull();
  });
});

describe('useUserPhoto', () => {
  it('renders the fallback when the photo failed to decrypt and the photo once it is available', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { useUserPhoto } = await import('@features/profile-photos/hooks/usePhotos');
    const bob = await person('bob');
    const photo = await publishUserPhoto(bob, 1);
    function Probe() {
      return createElement('span', null, useUserPhoto('bob') ?? 'fallback');
    }
    signIn(bob);
    photos.applySelfUser({ id: 'bob', encryptedAvatar: 'e2e:pp1:broken', profileKeyVersion: 1 });
    photos.retainUserPhoto('bob');
    await settle();
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<span>fallback</span>');

    photos.applySelfUser({ id: 'bob', encryptedAvatar: photo.encryptedAvatar, profileKeyVersion: 1 });
    await settle();
    expect(renderToStaticMarkup(createElement(Probe))).toMatch(/<span>blob:test\/\d+<\/span>/);
  });
});
