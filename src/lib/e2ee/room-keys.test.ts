import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { AppSocket, MessageView, RoomSummary, SealedRoomKeyEntry } from '@lib/socket';
import type { ContactPin, StoredRoomKeyGeneration } from './key-store';
import type * as MessageCryptoNamespace from './message-crypto';
import type * as RoomKeysNamespace from './room-keys';

const storeState = vi.hoisted(() => ({
  generations: new Map<string, Map<string, StoredRoomKeyGeneration>>(),
  pins: new Map<string, Map<string, ContactPin>>(),
}));

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

function keyStoreFor(name: string) {
  const generations = storeState.generations.get(name) ?? new Map<string, StoredRoomKeyGeneration>();
  storeState.generations.set(name, generations);
  const pins = storeState.pins.get(name) ?? new Map<string, ContactPin>();
  storeState.pins.set(name, pins);
  return {
    saveRoomKeyGeneration: (generation: StoredRoomKeyGeneration) => {
      generations.set(`${generation.roomId}|${generation.keyId}`, { ...generation, key: generation.key.slice() });
      return Promise.resolve();
    },
    loadRoomKeyGenerations: (roomId: string) =>
      Promise.resolve(Array.from(generations.values()).filter((generation) => generation.roomId === roomId)),
    clearRoomKeyStore: () => {
      generations.clear();
      return Promise.resolve();
    },
    contactPinId: (ownerId: string, contactId: string) => `${ownerId}:${contactId}`,
    loadContactPin: (ownerId: string, contactId: string) => Promise.resolve(pins.get(`${ownerId}:${contactId}`) ?? null),
    saveContactPin: (pin: ContactPin) => {
      pins.set(pin.id, pin);
      return Promise.resolve();
    },
  };
}

type RoomKeysModule = typeof RoomKeysNamespace;
type MessageCryptoModule = typeof MessageCryptoNamespace;

type Handler = (payload: never) => void;

interface DirectoryEntry {
  userId: string;
  publicKey: string;
  signingPublicKey: string;
  keySignature: string;
}

interface ServerRoom {
  id: string;
  type: 'private' | 'group';
  creatorId: string;
  members: string[];
  currentEpoch: number;
  currentKeyId: string | null;
  rotationRequired: number | null;
}

interface StoredEnvelope extends SealedRoomKeyEntry {
  recipientId: string;
}

class FakeSocket {
  private handlers = new Map<string, Set<Handler>>();
  readonly emitted: { event: string; payload: unknown }[] = [];

  constructor(
    private readonly server: FakeServer,
    readonly userId: string,
  ) {}

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

  emit(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
    this.server.deliver(this.userId, event, payload);
    return this;
  }

  receive(event: string, payload: unknown) {
    for (const handler of Array.from(this.handlers.get(event) ?? [])) {
      handler(payload as never);
    }
  }

  emittedOf(event: string): unknown[] {
    return this.emitted.filter((entry) => entry.event === event).map((entry) => entry.payload);
  }

  asAppSocket(): AppSocket {
    return this as unknown as AppSocket;
  }
}

class FakeServer {
  readonly directory = new Map<string, DirectoryEntry>();
  readonly sockets = new Map<string, FakeSocket>();
  readonly rooms = new Map<string, ServerRoom>();
  envelopes: StoredEnvelope[] = [];
  readonly rejections: { userId: string; roomId: string; epoch: number }[] = [];
  private held: (() => void)[] | null = null;

  hold(): void {
    this.held = [];
  }

  release(): void {
    const queued = this.held ?? [];
    this.held = null;
    for (const task of queued) {
      task();
    }
  }

  deliver(userId: string, event: string, payload: unknown): void {
    const task = () => {
      queueMicrotask(() => this.handle(userId, event, payload));
    };
    if (this.held) {
      this.held.push(task);
    } else {
      task();
    }
  }

  push(userId: string, event: string, payload: unknown): void {
    this.sockets.get(userId)?.receive(event, payload);
  }

  summary(roomId: string): RoomSummary {
    const room = this.rooms.get(roomId) as ServerRoom;
    return {
      id: room.id,
      type: room.type,
      creatorId: room.creatorId,
      participants: room.members.map((id) => ({ id, nickname: id })),
      currentEpoch: room.currentEpoch,
      currentKeyId: room.currentKeyId,
      rotationRequiredEpoch: room.rotationRequired,
    } as unknown as RoomSummary;
  }

  private handle(userId: string, event: string, payload: unknown): void {
    if (event === 'e2e:get-public-keys') {
      const { userIds } = payload as { userIds: string[] };
      const keys = userIds.map((id) => this.directory.get(id)).filter((entry) => entry !== undefined);
      this.push(userId, 'e2e:public-keys', { keys });
      return;
    }
    if (event === 'e2e:get-room-keys') {
      const { roomIds } = payload as { roomIds: string[] };
      const keys = this.envelopes
        .filter((entry) => entry.recipientId === userId && roomIds.includes(entry.roomId))
        .map(({ recipientId: _recipientId, ...entry }) => entry);
      this.push(userId, 'e2e:room-keys', { keys });
      return;
    }
    if (event === 'e2e:publish-room-key') {
      this.handlePublish(userId, payload as { roomId: string; keyId: string; epoch: number; keys: { userId: string; sealedKey: string }[] });
      return;
    }
    if (event === 'e2e:share-room-key') {
      this.handleShare(userId, payload as { roomId: string; keyId: string; epoch: number; keys: { userId: string; sealedKey: string }[] });
      return;
    }
    if (event === 'e2e:request-room-key') {
      const { roomId } = payload as { roomId: string };
      for (const member of this.rooms.get(roomId)?.members ?? []) {
        if (member !== userId) {
          this.push(member, 'e2e:key-request', { roomId, requesterId: userId });
        }
      }
    }
  }

  private store(roomId: string, keyId: string, epoch: number, senderId: string, keys: { userId: string; sealedKey: string }[]): void {
    for (const key of keys) {
      const entry = { roomId, keyId, epoch, senderId, sealedKey: key.sealedKey };
      this.envelopes.push({ ...entry, recipientId: key.userId });
      this.push(key.userId, 'e2e:room-key', entry);
    }
  }

  private handlePublish(
    userId: string,
    batch: { roomId: string; keyId: string; epoch: number; keys: { userId: string; sealedKey: string }[] },
  ): void {
    const room = this.rooms.get(batch.roomId);
    if (!room?.members.includes(userId)) {
      return;
    }
    const expected = room.rotationRequired ?? (room.currentEpoch === 0 ? 1 : null);
    const recipients = new Set(batch.keys.map((key) => key.userId));
    const covers = room.members.every((member) => recipients.has(member)) && recipients.size === room.members.length;
    if (batch.epoch !== expected || !covers) {
      this.rejections.push({ userId, roomId: batch.roomId, epoch: batch.epoch });
      this.push(userId, 'e2e:room-key-rejected', { roomId: batch.roomId, epoch: batch.epoch });
      return;
    }
    room.currentEpoch = batch.epoch;
    room.currentKeyId = batch.keyId;
    room.rotationRequired = null;
    this.store(batch.roomId, batch.keyId, batch.epoch, userId, batch.keys);
  }

  private handleShare(
    userId: string,
    batch: { roomId: string; keyId: string; epoch: number; keys: { userId: string; sealedKey: string }[] },
  ): void {
    const room = this.rooms.get(batch.roomId);
    if (!room?.members.includes(userId) || batch.keyId !== room.currentKeyId || batch.epoch !== room.currentEpoch) {
      return;
    }
    const missing = batch.keys.filter(
      (key) =>
        room.members.includes(key.userId) &&
        !this.envelopes.some((entry) => entry.recipientId === key.userId && entry.keyId === batch.keyId),
    );
    this.store(batch.roomId, batch.keyId, batch.epoch, userId, missing);
  }

  requireRotation(roomId: string, removedUserId?: string): void {
    const room = this.rooms.get(roomId) as ServerRoom;
    if (removedUserId) {
      room.members = room.members.filter((member) => member !== removedUserId);
    }
    room.rotationRequired = room.currentEpoch + 1;
    for (const member of room.members) {
      this.push(member, 'e2e:rotation-required', { roomId, epoch: room.rotationRequired, memberIds: room.members });
    }
  }
}

interface Client {
  userId: string;
  socket: FakeSocket;
  roomKeys: RoomKeysModule;
  messages: MessageCryptoModule;
  privateKey: Uint8Array;
  publicKey: string;
}

let server: FakeServer;

async function loadClient(userId: string, options: { store?: string; privateKey?: Uint8Array } = {}): Promise<Client> {
  const storeName = options.store ?? userId;
  vi.resetModules();
  vi.doMock('./key-store', () => keyStoreFor(storeName));
  const sodiumModule = await import('./sodium');
  const sodium = await sodiumModule.getSodium();
  const identityModule = await import('./current-identity');
  const signing = await import('./signing');
  const roomKeys = await import('./room-keys');
  const messages = await import('./message-crypto');

  const privateKey = options.privateKey ?? sodium.crypto_box_keypair().privateKey;
  const publicKey = sodium.to_base64(sodium.crypto_scalarmult_base(privateKey));
  const proof = await signing.buildSigningProof(userId, publicKey, privateKey);
  server.directory.set(userId, { userId, publicKey, ...proof });
  identityModule.setCurrentIdentity({ userId, publicKey, privateKey });

  const socket = new FakeSocket(server, userId);
  server.sockets.set(userId, socket);
  socket.on('e2e:room-key', (entry: SealedRoomKeyEntry) => void roomKeys.handleRoomKeyPush(socket.asAppSocket(), entry));
  socket.on('e2e:room-key-rejected', (payload: { roomId: string; epoch: number }) =>
    void roomKeys.handleRoomKeyRejected(socket.asAppSocket(), payload));
  socket.on('e2e:rotation-required', (payload: { roomId: string; epoch: number; memberIds?: string[] }) =>
    void roomKeys.handleRotationRequired(socket.asAppSocket(), payload));
  socket.on('e2e:key-request', (payload: { roomId: string; requesterId: string }) =>
    void roomKeys.handleKeyRequest(socket.asAppSocket(), payload));
  return { userId, socket, roomKeys, messages, privateKey, publicKey };
}

function createRoom(id: string, type: 'private' | 'group', creatorId: string, members: string[]): void {
  server.rooms.set(id, { id, type, creatorId, members, currentEpoch: 0, currentKeyId: null, rotationRequired: null });
}

async function track(client: Client, roomId: string, activeCreation = false): Promise<void> {
  await client.roomKeys.trackRoom(client.socket.asAppSocket(), server.summary(roomId), { activeCreation });
}

async function settle(): Promise<void> {
  for (let round = 0; round < 20; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function sendText(client: Client, roomId: string, content: string): Promise<MessageView> {
  await client.roomKeys.ensureRoomKeyForSending(client.socket.asAppSocket(), roomId);
  const encrypted = await client.messages.encryptOutgoingMessage({ roomId, content });
  return {
    id: encrypted.messageId,
    roomId,
    sender: { id: client.userId, nickname: client.userId, avatar: null },
    type: 'text',
    content: encrypted.content,
    duration: null,
    timestamp: new Date(0).toISOString(),
    deletedForEveryone: false,
    status: 'sent',
    deliveredTo: [],
    readBy: [],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: null,
    linkPreview: null,
    caption: null,
  };
}

async function readText(client: Client, message: MessageView): Promise<string> {
  return (await client.messages.decryptMessageView(client.socket.asAppSocket(), message)).content;
}

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  server = new FakeServer();
  storeState.generations.clear();
  storeState.pins.clear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('window', globalThis);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('generation 1', () => {
  it('is published once by the active creator of a private room and adopted by both members', async () => {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    createRoom('dm', 'private', 'ana', ['ana', 'bia']);

    await Promise.all([track(ana, 'dm', true), track(bia, 'dm', false)]);
    await settle();

    expect(ana.socket.emittedOf('e2e:publish-room-key')).toHaveLength(1);
    expect(bia.socket.emittedOf('e2e:publish-room-key')).toHaveLength(0);
    const anaKey = ana.roomKeys.getCurrentRoomKey('dm');
    const biaKey = bia.roomKeys.getCurrentRoomKey('dm');
    expect(anaKey?.epoch).toBe(1);
    expect(biaKey?.keyId).toBe(anaKey?.keyId);
    expect(Array.from(biaKey?.key ?? [])).toEqual(Array.from(anaKey?.key ?? []));
  });

  it('publishes a batch whose envelopes cover every member with the v2 envelope', async () => {
    const ana = await loadClient('ana');
    await loadClient('bia');
    createRoom('dm', 'private', 'ana', ['ana', 'bia']);

    await track(ana, 'dm', true);
    await settle();

    const [batch] = ana.socket.emittedOf('e2e:publish-room-key') as { roomId: string; keyId: string; epoch: number; keys: { userId: string; sealedKey: string }[] }[];
    expect(batch?.epoch).toBe(1);
    expect(batch?.keyId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(batch?.keys.map((key) => key.userId).sort()).toEqual(['ana', 'bia']);
    for (const key of batch?.keys ?? []) {
      expect(JSON.parse(key.sealedKey)).toMatchObject({ v: 2, roomId: 'dm', keyId: batch?.keyId, epoch: 1, senderId: 'ana', recipientId: key.userId });
    }
  });

  it('is published by the first member to send when nobody established it yet', async () => {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    createRoom('dm', 'private', 'ana', ['ana', 'bia']);
    await Promise.all([track(ana, 'dm', false), track(bia, 'dm', false)]);
    await settle();
    expect(server.rooms.get('dm')?.currentEpoch).toBe(0);

    const message = await sendText(bia, 'dm', 'oi');
    await settle();

    expect(server.rooms.get('dm')?.currentEpoch).toBe(1);
    expect(await readText(ana, message)).toBe('oi');
  });
});

describe('rotation', () => {
  async function groupAtEpochOne(memberIds: string[]): Promise<Client[]> {
    const clients: Client[] = [];
    for (const id of memberIds) {
      clients.push(await loadClient(id));
    }
    createRoom('group', 'group', memberIds[0] as string, memberIds);
    await Promise.all(clients.map((client) => track(client, 'group')));
    await settle();
    return clients;
  }

  it('resolves a race between two members: one batch wins and the other member adopts it', async () => {
    const [ana, bia, caio] = await groupAtEpochOne(['ana', 'bia', 'caio']);
    if (!ana || !bia || !caio) {
      throw new Error('clients missing');
    }
    const firstKeyId = ana.roomKeys.getCurrentRoomKey('group')?.keyId;

    server.requireRotation('group', 'caio');
    await settle();

    const anaBatches = ana.socket.emittedOf('e2e:publish-room-key') as { epoch: number }[];
    const biaBatches = bia.socket.emittedOf('e2e:publish-room-key') as { epoch: number }[];
    expect(anaBatches.filter((batch) => batch.epoch === 2)).toHaveLength(1);
    expect(biaBatches.filter((batch) => batch.epoch === 2)).toHaveLength(1);
    expect(server.rejections.filter((rejection) => rejection.epoch === 2)).toHaveLength(1);

    const anaKey = ana.roomKeys.getCurrentRoomKey('group');
    const biaKey = bia.roomKeys.getCurrentRoomKey('group');
    expect(anaKey?.epoch).toBe(2);
    expect(anaKey?.keyId).not.toBe(firstKeyId);
    expect(biaKey?.keyId).toBe(anaKey?.keyId);
    expect(biaKey?.keyId).toBe(server.rooms.get('group')?.currentKeyId);
    expect(server.envelopes.some((entry) => entry.recipientId === 'caio' && entry.epoch === 2)).toBe(false);
  });

  it('never seals the new generation to the member who left', async () => {
    const [ana] = await groupAtEpochOne(['ana', 'bia', 'caio']);
    server.requireRotation('group', 'caio');
    await settle();

    const batches = ana?.socket.emittedOf('e2e:publish-room-key') as { epoch: number; keys: { userId: string }[] }[];
    for (const batch of batches.filter((entry) => entry.epoch === 2)) {
      expect(batch.keys.map((key) => key.userId)).not.toContain('caio');
    }
  });

  it('keeps history readable across generations, also after reloading from the device store', async () => {
    const [ana, bia] = await groupAtEpochOne(['ana', 'bia', 'caio']);
    if (!ana || !bia) {
      throw new Error('clients missing');
    }
    const before = await sendText(ana, 'group', 'before rotation');
    server.requireRotation('group', 'caio');
    await settle();
    const after = await sendText(ana, 'group', 'after rotation');

    expect(before.content).not.toBe(after.content);
    expect(await readText(bia, before)).toBe('before rotation');
    expect(await readText(bia, after)).toBe('after rotation');

    server.envelopes = server.envelopes.filter((entry) => entry.epoch !== 1);
    const reloaded = await loadClient('bia', { store: 'bia', privateKey: bia.privateKey });
    await track(reloaded, 'group');
    expect(await readText(reloaded, before)).toBe('before rotation');
    expect(await readText(reloaded, after)).toBe('after rotation');
  });

  it('refuses to send with the old generation while a rotation is pending and rotates before sending', async () => {
    const [ana] = await groupAtEpochOne(['ana', 'bia']);
    if (!ana) {
      throw new Error('client missing');
    }
    const room = server.rooms.get('group') as ServerRoom;
    room.rotationRequired = 2;
    server.hold();
    const tracking = track(ana, 'group');

    expect(() => ana.roomKeys.requireCurrentRoomKey('group')).toThrow(ana.roomKeys.MissingRoomKeyError);
    const sending = ana.roomKeys.ensureRoomKeyForSending(ana.socket.asAppSocket(), 'group');
    server.release();
    const [generation] = await Promise.all([sending, tracking]);

    expect(generation.epoch).toBe(2);
    expect(room.currentEpoch).toBe(2);
  });

  it('skips the rotation when a member key changed and was not accepted', async () => {
    const [ana, bia] = await groupAtEpochOne(['ana', 'bia', 'caio']);
    if (!ana || !bia) {
      throw new Error('clients missing');
    }
    await loadClient('bia');
    ana.socket.emitted.length = 0;

    server.requireRotation('group', 'caio');
    await settle();

    expect(ana.socket.emittedOf('e2e:publish-room-key')).toHaveLength(0);
    expect(ana.roomKeys.getCurrentRoomKey('group')).toBeNull();
  });
});

describe('new members', () => {
  it('receive only the current generation, without a rotation', async () => {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    createRoom('group', 'group', 'ana', ['ana', 'bia']);
    await Promise.all([track(ana, 'group'), track(bia, 'group')]);
    await settle();
    server.requireRotation('group');
    await settle();
    const current = ana.roomKeys.getCurrentRoomKey('group');
    expect(current?.epoch).toBe(2);

    const davi = await loadClient('davi');
    const room = server.rooms.get('group') as ServerRoom;
    room.members.push('davi');
    await track(davi, 'group');
    await ana.roomKeys.handleGroupUserJoined(ana.socket.asAppSocket(), {
      roomId: 'group',
      participants: room.members.map((id) => ({ id, nickname: id })) as never,
    });
    await settle();

    expect(room.currentEpoch).toBe(2);
    expect(davi.roomKeys.getCurrentRoomKey('group')?.keyId).toBe(current?.keyId);
    expect(server.envelopes.filter((entry) => entry.recipientId === 'davi').map((entry) => entry.epoch)).toEqual([2]);
  });

  it('ask the members for the current generation when it is missing', async () => {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    createRoom('group', 'group', 'ana', ['ana', 'bia']);
    server.sockets.delete('bia');
    await track(ana, 'group');
    await settle();

    const room = server.rooms.get('group') as ServerRoom;
    server.envelopes = server.envelopes.filter((entry) => entry.recipientId !== 'bia');
    server.sockets.set('bia', bia.socket);
    await track(bia, 'group');
    await settle();

    expect(bia.socket.emittedOf('e2e:request-room-key')).toEqual([{ roomId: 'group' }]);
    expect(bia.roomKeys.getCurrentRoomKey('group')?.keyId).toBe(room.currentKeyId);
  });
});

describe('envelope acceptance', () => {
  async function establishedRoom(): Promise<{ ana: Client; bia: Client }> {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    createRoom('dm', 'private', 'ana', ['ana', 'bia']);
    await Promise.all([track(ana, 'dm', true), track(bia, 'dm')]);
    await settle();
    return { ana, bia };
  }

  async function forgeEnvelope(
    from: Client,
    to: { userId: string; publicKey: string },
    fields: { roomId: string; epoch: number; keyId?: string },
  ): Promise<SealedRoomKeyEntry> {
    const envelope = await import('./room-key-envelope');
    const signing = await import('./signing');
    const pair = await signing.deriveSigningKeyPair(from.privateKey);
    const keyId = fields.keyId ?? (await envelope.generateRoomKeyId());
    const sealedKey = await envelope.sealRoomKeyEnvelope({
      roomKey: crypto.getRandomValues(new Uint8Array(32)),
      roomId: fields.roomId,
      keyId,
      epoch: fields.epoch,
      senderId: from.userId,
      senderPrivateKey: from.privateKey,
      senderSigningPrivateKey: pair.privateKey,
      recipientId: to.userId,
      recipientPublicKey: to.publicKey,
    });
    return { roomId: fields.roomId, keyId, epoch: fields.epoch, senderId: from.userId, sealedKey };
  }

  function discardReasons(): string[] {
    return warn.mock.calls
      .filter((call) => call[0] === '[e2e] discarded room key envelope')
      .map((call) => (call[1] as { reason: string }).reason);
  }

  it('discards a validly signed envelope from someone who is not a member', async () => {
    const { bia } = await establishedRoom();
    const eve = await loadClient('eve');
    await bia.roomKeys.handleRoomKeyPush(bia.socket.asAppSocket(), await forgeEnvelope(eve, bia, { roomId: 'dm', epoch: 2 }));

    expect(bia.roomKeys.getCurrentRoomKey('dm')?.epoch).toBe(1);
    expect(discardReasons()).toContain('non-member-sender');
  });

  it('discards an envelope addressed to another member', async () => {
    const { ana, bia } = await establishedRoom();
    const entry = await forgeEnvelope(ana, { userId: 'ana', publicKey: ana.publicKey }, { roomId: 'dm', epoch: 2 });
    await bia.roomKeys.handleRoomKeyPush(bia.socket.asAppSocket(), entry);

    expect(bia.roomKeys.getCurrentRoomKey('dm')?.epoch).toBe(1);
    expect(discardReasons()).toContain('wrong-recipient');
  });

  it('discards an envelope for another room delivered under this room id', async () => {
    const { ana, bia } = await establishedRoom();
    const entry = await forgeEnvelope(ana, bia, { roomId: 'other', epoch: 2 });
    await bia.roomKeys.handleRoomKeyPush(bia.socket.asAppSocket(), { ...entry, roomId: 'dm' });

    expect(bia.roomKeys.getCurrentRoomKey('dm')?.epoch).toBe(1);
    expect(discardReasons()).toContain('wrong-room');
  });

  it('discards an envelope signed by a key other than the pinned one', async () => {
    const { bia } = await establishedRoom();
    const impostor = await loadClient('ana');
    const entry = await forgeEnvelope(impostor, bia, { roomId: 'dm', epoch: 2 });
    await bia.roomKeys.handleRoomKeyPush(bia.socket.asAppSocket(), entry);

    expect(bia.roomKeys.getCurrentRoomKey('dm')?.epoch).toBe(1);
    expect(discardReasons()).toContain('bad-signature');
  });

  it('discards an envelope from a sender without a pinned signing key', async () => {
    const { ana, bia } = await establishedRoom();
    const entry = await forgeEnvelope(ana, bia, { roomId: 'dm', epoch: 2 });
    server.directory.delete('ana');
    const fresh = await loadClient('bia', { store: 'fresh-bia', privateKey: bia.privateKey });
    await track(fresh, 'dm');
    await fresh.roomKeys.handleRoomKeyPush(fresh.socket.asAppSocket(), entry);

    expect(fresh.roomKeys.getCurrentRoomKey('dm')).toBeNull();
    expect(discardReasons()).toContain('unpinned-sender');
  });

  it('discards a push whose outer fields disagree with the signed envelope', async () => {
    const { ana, bia } = await establishedRoom();
    const entry = await forgeEnvelope(ana, bia, { roomId: 'dm', epoch: 2 });
    await bia.roomKeys.handleRoomKeyPush(bia.socket.asAppSocket(), { ...entry, epoch: 5 });

    expect(bia.roomKeys.getCurrentRoomKey('dm')?.epoch).toBe(1);
    expect(discardReasons()).toContain('malformed');
  });

  it('keeps the first generation of an epoch and ignores a second key id for it', async () => {
    const { ana, bia } = await establishedRoom();
    const before = bia.roomKeys.getCurrentRoomKey('dm');
    await bia.roomKeys.handleRoomKeyPush(bia.socket.asAppSocket(), await forgeEnvelope(ana, bia, { roomId: 'dm', epoch: 1 }));

    expect(bia.roomKeys.getCurrentRoomKey('dm')?.keyId).toBe(before?.keyId);
  });

  it('holds an envelope for a room it does not know yet and accepts it once the room is tracked', async () => {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    createRoom('dm', 'private', 'ana', ['ana', 'bia']);
    await track(ana, 'dm');
    const entry = await forgeEnvelope(ana, bia, { roomId: 'dm', epoch: 1 });

    await bia.roomKeys.handleRoomKeyPush(bia.socket.asAppSocket(), entry);
    expect(bia.roomKeys.getCurrentRoomKey('dm')).toBeNull();
    await track(bia, 'dm');

    expect(bia.roomKeys.getCurrentRoomKey('dm')?.keyId).toBe(entry.keyId);
  });

  it('does not ask the server again for a generation it failed to find until the retry window passes', async () => {
    const { bia } = await establishedRoom();
    bia.socket.emitted.length = 0;
    const unknown = 'A'.repeat(22);

    expect(await bia.roomKeys.ensureRoomKeyGeneration(bia.socket.asAppSocket(), 'dm', unknown)).toBeNull();
    expect(await bia.roomKeys.ensureRoomKeyGeneration(bia.socket.asAppSocket(), 'dm', unknown)).toBeNull();

    expect(bia.socket.emittedOf('e2e:get-room-keys')).toHaveLength(1);

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000);
    expect(await bia.roomKeys.ensureRoomKeyGeneration(bia.socket.asAppSocket(), 'dm', unknown)).toBeNull();
    expect(bia.socket.emittedOf('e2e:get-room-keys')).toHaveLength(2);
  });

  it('forgets every generation on sign out', async () => {
    const { bia } = await establishedRoom();
    await bia.roomKeys.clearRoomKeys();
    expect(bia.roomKeys.getCurrentRoomKey('dm')).toBeNull();
    expect(storeState.generations.get('bia')?.size).toBe(0);
  });

  it('notifies listeners when a generation becomes available', async () => {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    const listener = vi.fn();
    bia.roomKeys.subscribeRoomKeyAvailable(listener);
    createRoom('dm', 'private', 'ana', ['ana', 'bia']);
    await Promise.all([track(ana, 'dm', true), track(bia, 'dm')]);
    await settle();

    expect(listener).toHaveBeenCalledWith('dm');
  });
});

describe('server feedback', () => {
  async function groupWith(memberIds: string[]): Promise<Client[]> {
    const clients: Client[] = [];
    for (const id of memberIds) {
      clients.push(await loadClient(id));
    }
    createRoom('group', 'group', memberIds[0] as string, memberIds);
    await Promise.all(clients.map((client) => track(client, 'group')));
    await settle();
    return clients;
  }

  it('resyncs from a rejection and performs the rotation the server reports as pending', async () => {
    const [ana] = await groupWith(['ana', 'bia']);
    if (!ana) {
      throw new Error('client missing');
    }
    const room = server.rooms.get('group') as ServerRoom;
    room.rotationRequired = 2;
    ana.socket.emitted.length = 0;

    await ana.roomKeys.handleRoomKeyRejected(ana.socket.asAppSocket(), {
      roomId: 'group',
      epoch: 1,
      code: 'e2e.roomKeyStale',
      currentEpoch: 1,
      currentKeyId: room.currentKeyId,
      rotationRequiredEpoch: 2,
    });
    await settle();

    expect(ana.socket.emittedOf('e2e:publish-room-key')).toEqual([expect.objectContaining({ epoch: 2 })]);
    expect(ana.roomKeys.getCurrentRoomKey('group')?.epoch).toBe(2);
  });

  it('does not republish right away after an incomplete batch', async () => {
    const [ana] = await groupWith(['ana', 'bia']);
    if (!ana) {
      throw new Error('client missing');
    }
    ana.socket.emitted.length = 0;

    await ana.roomKeys.handleRoomKeyRejected(ana.socket.asAppSocket(), {
      roomId: 'group',
      epoch: 2,
      code: 'e2e.roomKeyIncomplete',
      currentEpoch: 1,
      currentKeyId: server.rooms.get('group')?.currentKeyId ?? null,
      rotationRequiredEpoch: 3,
    });
    await settle();

    expect(ana.socket.emittedOf('e2e:publish-room-key')).toHaveLength(0);
  });

  it('recovers from a stale send by rotating when it holds no newer generation', async () => {
    const [ana] = await groupWith(['ana', 'bia']);
    if (!ana) {
      throw new Error('client missing');
    }
    const staleKeyId = ana.roomKeys.getCurrentRoomKey('group')?.keyId as string;
    (server.rooms.get('group') as ServerRoom).rotationRequired = 2;

    const generation = await ana.roomKeys.recoverFromStaleRoomKey(ana.socket.asAppSocket(), 'group', staleKeyId);

    expect(generation.epoch).toBe(2);
    expect(generation.keyId).not.toBe(staleKeyId);
  });

  it('recovers from a stale send by adopting a newer generation it had missed', async () => {
    const [ana, bia] = await groupWith(['ana', 'bia']);
    if (!ana || !bia) {
      throw new Error('clients missing');
    }
    const staleKeyId = bia.roomKeys.getCurrentRoomKey('group')?.keyId as string;
    server.sockets.delete('bia');
    server.requireRotation('group');
    await settle();
    server.sockets.set('bia', bia.socket);
    bia.socket.emitted.length = 0;

    const generation = await bia.roomKeys.recoverFromStaleRoomKey(bia.socket.asAppSocket(), 'group', staleKeyId);

    expect(generation.keyId).toBe(server.rooms.get('group')?.currentKeyId);
    expect(bia.socket.emittedOf('e2e:publish-room-key')).toHaveLength(0);
  });

  it('never publishes a batch larger than the server accepts', async () => {
    const ana = await loadClient('ana');
    const members = ['ana', ...Array.from({ length: 150 }, (_, index) => `member-${index}`)];
    createRoom('big', 'group', 'ana', members);

    await track(ana, 'big');

    expect(ana.socket.emittedOf('e2e:publish-room-key')).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith('[e2e] room has more members than a room key batch can hold', expect.anything());
  });

  it('splits key shares for many new members into batches of at most 150', async () => {
    const ana = await loadClient('ana');
    createRoom('group', 'group', 'ana', ['ana']);
    await track(ana, 'group');
    await settle();
    const sodium = await (await import('./sodium')).getSodium();
    const signing = await import('./signing');
    const newcomers = Array.from({ length: 151 }, (_, index) => `new-${index}`);
    for (const userId of newcomers) {
      const pair = sodium.crypto_box_keypair();
      const publicKey = sodium.to_base64(pair.publicKey);
      server.directory.set(userId, { userId, publicKey, ...(await signing.buildSigningProof(userId, publicKey, pair.privateKey)) });
    }
    const room = server.rooms.get('group') as ServerRoom;
    room.members.push(...newcomers);

    await ana.roomKeys.handleGroupUserJoined(ana.socket.asAppSocket(), {
      roomId: 'group',
      participants: room.members.map((id) => ({ id, nickname: id })) as never,
    });

    const shares = ana.socket.emittedOf('e2e:share-room-key') as { keys: unknown[] }[];
    expect(shares.map((share) => share.keys.length)).toEqual([150, 1]);
  });
});
