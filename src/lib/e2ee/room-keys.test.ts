import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { AppSocket, MessageView, RoomSummary, SealedRoomKeyEntry } from '@lib/socket';
import type { GroupRoster } from './group-invite';
import type { ContactPin, StoredRoomKeyGeneration } from './key-store';
import type * as ContactTrustNamespace from './contact-trust';
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
  invite: { encryptedInvite: string; keyId: string; active: boolean } | null;
  roster: { encryptedRoster: string; keyId: string } | null;
  tokenHash: string | null;
  inviteProofs: Map<string, string>;
  encryptedName: { encryptedName: string; keyId: string } | null;
  rosters: Map<string, string>;
}

interface PublishedBatch {
  roomId: string;
  keyId: string;
  epoch: number;
  keys: { userId: string; sealedKey: string }[];
  invite?: { tokenHash: string; encryptedInvite: string };
  roster?: string;
  name?: string;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
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
  readonly keyRequests: { userId: string; payload: Record<string, unknown> }[] = [];
  readonly failResets = new Set<string>();
  truncateRosters = false;
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

  readonly nicknames = new Map<string, string>();

  summary(roomId: string): RoomSummary {
    const room = this.rooms.get(roomId) as ServerRoom;
    return {
      id: room.id,
      type: room.type,
      creatorId: room.creatorId,
      participants: room.members.map((id) => ({ id, nickname: this.nicknames.get(id) ?? id })),
      currentEpoch: room.currentEpoch,
      currentKeyId: room.currentKeyId,
      rotationRequiredEpoch: room.rotationRequired,
      invite: room.invite,
      roster: room.roster,
      inviteProofs: this.proofList(room),
      encryptedName: room.type === 'group' ? room.encryptedName : null,
    } as unknown as RoomSummary;
  }

  proofList(room: ServerRoom): { userId: string; proof: string }[] {
    return Array.from(room.inviteProofs, ([userId, proof]) => ({ userId, proof }));
  }

  deactivateInvite(room: ServerRoom): void {
    room.invite = room.invite ? { ...room.invite, active: false } : null;
    room.tokenHash = null;
  }

  pushInvite(roomId: string): void {
    const room = this.rooms.get(roomId) as ServerRoom;
    for (const member of room.members) {
      this.push(member, 'room:invite-updated', { roomId, invite: room.invite, roster: room.roster });
    }
  }

  private async handleJoinByInvite(userId: string, payload: { roomId: string; inviteToken: string; proof: string }): Promise<void> {
    const room = this.rooms.get(payload.roomId);
    if (!room || room.type !== 'group' || !room.tokenHash || (await sha256Hex(payload.inviteToken)) !== room.tokenHash) {
      this.push(userId, 'error', { message: 'invalid', code: 'room.invalidInvite', event: 'room:join-by-invite' });
      return;
    }
    if (!room.members.includes(userId)) {
      room.members.push(userId);
    }
    room.inviteProofs.set(userId, payload.proof);
    const participants = room.members.map((id) => ({ id, nickname: id }));
    for (const member of room.members) {
      if (member !== userId) {
        this.push(member, 'group:user-joined', { roomId: room.id, participants });
      }
    }
    this.push(userId, 'room:joined', { room: this.summary(room.id), messages: [] });
  }

  private handleResetInvite(userId: string, payload: { roomId: string }): void {
    const room = this.rooms.get(payload.roomId);
    if (!room?.members.includes(userId) || room.type !== 'group' || this.failResets.has(payload.roomId)) {
      this.push(userId, 'error', { message: 'failed', code: 'rateLimit.inviteReset', event: 'room:reset-invite', roomId: payload.roomId });
      return;
    }
    this.deactivateInvite(room);
    this.pushInvite(room.id);
    this.requireRotation(room.id);
  }

  private handle(userId: string, event: string, payload: unknown): void {
    if (event === 'e2e:get-public-keys') {
      const { userIds } = payload as { userIds: string[] };
      const keys = userIds.map((id) => this.directory.get(id)).filter((entry) => entry !== undefined);
      this.push(userId, 'e2e:public-keys', { keys });
      return;
    }
    if (event === 'e2e:get-room-keys') {
      const { roomIds, keyIds } = payload as { roomIds: string[]; keyIds?: Record<string, string[]> };
      if (keyIds && Object.values(keyIds).some((ids) => ids.length > 50)) {
        this.push(userId, 'error', { message: 'too large', code: 'e2e.lookupTooLarge', event: 'e2e:get-room-keys' });
        return;
      }
      const keys = this.envelopes
        .filter((entry) => entry.recipientId === userId && roomIds.includes(entry.roomId))
        .filter((entry) => !keyIds?.[entry.roomId] || keyIds[entry.roomId]?.includes(entry.keyId))
        .map(({ recipientId: _recipientId, ...entry }) => entry);
      if (this.truncateRosters && !keyIds) {
        this.push(userId, 'e2e:room-keys', { keys: keys.map(({ roster: _roster, ...entry }) => entry), truncated: true });
        return;
      }
      this.push(userId, 'e2e:room-keys', { keys });
      return;
    }
    if (event === 'e2e:publish-room-key') {
      this.handlePublish(userId, payload as PublishedBatch);
      return;
    }
    if (event === 'room:rename') {
      const { roomId, name, keyId } = payload as { roomId: string; name: string; keyId: string };
      const room = this.rooms.get(roomId);
      if (!room?.members.includes(userId)) {
        return;
      }
      if (keyId !== room.currentKeyId) {
        this.push(userId, 'error', { message: 'stale', code: 'e2e.nameKeyStale', event: 'room:rename' });
        return;
      }
      room.encryptedName = { encryptedName: name, keyId };
      this.pushName(room);
      return;
    }
    if (event === 'room:join-by-invite') {
      void this.handleJoinByInvite(userId, payload as { roomId: string; inviteToken: string; proof: string });
      return;
    }
    if (event === 'room:reset-invite') {
      this.handleResetInvite(userId, payload as { roomId: string });
      return;
    }
    if (event === 'rooms:get') {
      const rooms = Array.from(this.rooms.values())
        .filter((room) => room.members.includes(userId))
        .map((room) => this.summary(room.id));
      this.push(userId, 'rooms:list', { rooms });
      return;
    }
    if (event === 'e2e:share-room-key') {
      this.handleShare(userId, payload as { roomId: string; keyId: string; epoch: number; keys: { userId: string; sealedKey: string }[] });
      return;
    }
    if (event === 'e2e:request-room-key') {
      const { roomId, ...rest } = payload as { roomId: string };
      this.keyRequests.push({ userId, payload: { roomId, ...rest } });
      const room = this.rooms.get(roomId);
      const proof = room?.inviteProofs.get(userId) ?? null;
      for (const member of room?.members ?? []) {
        if (member !== userId) {
          this.push(member, 'e2e:key-request', { roomId, requesterId: userId, proof });
        }
      }
    }
  }

  pushName(room: ServerRoom): void {
    for (const member of room.members) {
      this.push(member, 'room:name-updated', { roomId: room.id, ...room.encryptedName });
    }
  }

  private store(roomId: string, keyId: string, epoch: number, senderId: string, keys: { userId: string; sealedKey: string }[]): void {
    const roster = this.rooms.get(roomId)?.rosters.get(keyId);
    for (const key of keys) {
      const entry = { roomId, keyId, epoch, senderId, sealedKey: key.sealedKey, ...(roster ? { roster } : {}) };
      this.envelopes.push({ ...entry, recipientId: key.userId });
      this.push(key.userId, 'e2e:room-key', entry);
    }
  }

  private handlePublish(userId: string, batch: PublishedBatch): void {
    const room = this.rooms.get(batch.roomId);
    if (!room?.members.includes(userId)) {
      return;
    }
    const expected = room.rotationRequired ?? (room.currentEpoch === 0 ? 1 : null);
    const recipients = new Set(batch.keys.map((key) => key.userId));
    const covers = room.members.every((member) => recipients.has(member)) && recipients.size === room.members.length;
    const invitePresent = room.type !== 'group' || Boolean(batch.invite?.tokenHash && batch.invite.encryptedInvite && batch.roster);
    if (batch.epoch !== expected || !covers || !invitePresent) {
      this.rejections.push({ userId, roomId: batch.roomId, epoch: batch.epoch });
      this.push(userId, 'e2e:room-key-rejected', { roomId: batch.roomId, epoch: batch.epoch });
      return;
    }
    if (room.type === 'group' && (typeof batch.name !== 'string' || batch.name.length === 0 || batch.name.length > 2048)) {
      this.rejections.push({ userId, roomId: batch.roomId, epoch: batch.epoch });
      this.push(userId, 'e2e:room-key-rejected', { roomId: batch.roomId, epoch: batch.epoch, code: 'e2e.nameRequired' });
      return;
    }
    room.currentEpoch = batch.epoch;
    room.currentKeyId = batch.keyId;
    room.rotationRequired = null;
    if (batch.invite && batch.roster) {
      room.invite = { encryptedInvite: batch.invite.encryptedInvite, keyId: batch.keyId, active: true };
      room.roster = { encryptedRoster: batch.roster, keyId: batch.keyId };
      room.tokenHash = batch.invite.tokenHash;
      room.rosters.set(batch.keyId, batch.roster);
    }
    if (batch.name) {
      room.encryptedName = { encryptedName: batch.name, keyId: batch.keyId };
    }
    this.store(batch.roomId, batch.keyId, batch.epoch, userId, batch.keys);
    if (batch.invite) {
      this.pushInvite(batch.roomId);
    }
    if (batch.name) {
      this.pushName(room);
    }
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
      room.inviteProofs.delete(removedUserId);
      if (room.type === 'group') {
        this.deactivateInvite(room);
        this.pushInvite(roomId);
      }
    }
    room.rotationRequired = room.currentEpoch + 1;
    for (const member of room.members) {
      this.push(member, 'e2e:rotation-required', {
        roomId,
        epoch: room.rotationRequired,
        memberIds: room.members,
        inviteProofs: this.proofList(room),
      });
    }
  }
}

interface Client {
  userId: string;
  socket: FakeSocket;
  roomKeys: RoomKeysModule;
  messages: MessageCryptoModule;
  trust: typeof ContactTrustNamespace;
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
  const trust = await import('./contact-trust');

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
  socket.on('e2e:key-request', (payload: { roomId: string; requesterId: string; proof?: string }) =>
    void roomKeys.handleKeyRequest(socket.asAppSocket(), payload));
  socket.on('room:invite-updated', (payload: { roomId: string; invite: unknown }) => roomKeys.handleRoomInviteUpdated(payload));
  socket.on('room:name-updated', (payload: { roomId: string; encryptedName: string; keyId: string }) =>
    void roomKeys.handleRoomNameUpdated(socket.asAppSocket(), payload));
  socket.on('rooms:list', (payload: { rooms: RoomSummary[] }) => {
    for (const room of payload.rooms) {
      void roomKeys.trackRoom(socket.asAppSocket(), room);
    }
  });
  socket.on('error', (payload: { event?: string; roomId?: string }) => {
    if (payload.event === 'room:reset-invite') {
      roomKeys.handleRoomInviteResetRejected(payload);
    }
  });
  socket.on('group:user-joined', (payload: { roomId: string; participants: never }) =>
    void roomKeys.handleGroupUserJoined(socket.asAppSocket(), payload));
  return { userId, socket, roomKeys, messages, trust, privateKey, publicKey };
}

function createRoom(id: string, type: 'private' | 'group', creatorId: string, members: string[]): void {
  server.rooms.set(id, {
    id,
    type,
    creatorId,
    members,
    currentEpoch: 0,
    currentKeyId: null,
    rotationRequired: null,
    invite: null,
    roster: null,
    tokenHash: null,
    inviteProofs: new Map(),
    encryptedName: null,
    rosters: new Map(),
  });
}

const GROUP_NAME = 'Weekend trip';

async function track(client: Client, roomId: string, activeCreation = false): Promise<void> {
  const room = server.rooms.get(roomId);
  const groupName = room?.type === 'group' && room.creatorId === client.userId ? GROUP_NAME : undefined;
  await client.roomKeys.trackRoom(client.socket.asAppSocket(), server.summary(roomId), { activeCreation, ...(groupName ? { groupName } : {}) });
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

async function forgeEnvelope(
  from: Client,
  to: { userId: string; publicKey: string },
  fields: { roomId: string; epoch: number; keyId?: string },
): Promise<SealedRoomKeyEntry> {
  const envelope = await import('./room-key-envelope');
  const signing = await import('./signing');
  const pair = await signing.deriveSigningKeyPair(from.privateKey);
  const roomKey = crypto.getRandomValues(new Uint8Array(32));
  const keyId = fields.keyId ?? (await envelope.deriveRoomKeyId(roomKey));
  const sealedKey = await envelope.sealRoomKeyEnvelope({
    roomKey,
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
    await formGroup('group', memberIds[0] as string, clients);
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
    const anaAttempts = anaBatches.filter((batch) => batch.epoch === 2).length;
    const biaAttempts = biaBatches.filter((batch) => batch.epoch === 2).length;
    expect(anaAttempts).toBeLessThanOrEqual(1);
    expect(biaAttempts).toBeLessThanOrEqual(1);
    expect(anaAttempts + biaAttempts).toBeGreaterThanOrEqual(1);
    expect(server.rejections.filter((rejection) => rejection.epoch === 2)).toHaveLength(anaAttempts + biaAttempts - 1);

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

const ORIGIN = 'https://spark.test';

async function inviteLink(client: Client, roomId: string): Promise<string | null> {
  return client.roomKeys.getGroupInviteLink(client.socket.asAppSocket(), roomId, ORIGIN);
}

async function secretFromLink(link: string): Promise<Uint8Array> {
  const invite = await import('./group-invite');
  const target = invite.parseInviteFragment(new URL(link).hash);
  if (!target) {
    throw new Error('invalid link');
  }
  return target.secret;
}

async function joinGroup(joiner: Client, roomId: string, via: Client): Promise<void> {
  const link = await inviteLink(via, roomId);
  if (!link) {
    throw new Error('no invite link');
  }
  joiner.socket.emit('room:join-by-invite', await joiner.roomKeys.prepareInviteJoin(roomId, await secretFromLink(link)));
  await settle();
  await track(joiner, roomId);
  await settle();
}

async function formGroup(roomId: string, creatorId: string, clients: Client[]): Promise<void> {
  const creator = clients.find((client) => client.userId === creatorId) as Client;
  createRoom(roomId, 'group', creatorId, [creatorId]);
  await track(creator, roomId);
  await settle();
  for (const client of clients) {
    if (client !== creator) {
      await joinGroup(client, roomId, creator);
    }
  }
}

function addMember(roomId: string, userId: string, proof?: string): void {
  const room = server.rooms.get(roomId) as ServerRoom;
  room.members.push(userId);
  if (proof !== undefined) {
    room.inviteProofs.set(userId, proof);
  }
  const participants = room.members.map((id) => ({ id, nickname: id }));
  for (const member of room.members) {
    if (member !== userId) {
      server.push(member, 'group:user-joined', { roomId, participants });
    }
  }
}

function keyRequestRejections(): string[] {
  return warn.mock.calls
    .filter((call) => call[0] === '[e2e] ignored group key request')
    .map((call) => (call[1] as { reason: string }).reason);
}

function unverifiedWarnings(): unknown[] {
  return warn.mock.calls.filter((call) => call[0] === '[e2e] cannot verify every member for a new group generation').map((call): unknown => call[1] as unknown);
}

async function establishGroup(): Promise<{ ana: Client; bia: Client }> {
  const ana = await loadClient('ana');
  const bia = await loadClient('bia');
  await formGroup('group', 'ana', [ana, bia]);
  return { ana, bia };
}

function batchesOf(client: Client, epoch?: number): PublishedBatch[] {
  return (client.socket.emittedOf('e2e:publish-room-key') as PublishedBatch[]).filter((batch) => epoch === undefined || batch.epoch === epoch);
}

async function rosterOf(client: Client, batch: PublishedBatch): Promise<GroupRoster | null> {
  const invite = await import('./group-invite');
  const key = client.roomKeys.getRoomKeyGeneration(batch.roomId, batch.keyId);
  return key && batch.roster ? invite.openRoster(batch.roster, key, batch.roomId, batch.keyId, batch.epoch) : null;
}

async function proofFor(secret: Uint8Array, joinerId: string, signingKey?: string): Promise<string> {
  const invite = await import('./group-invite');
  return invite.deriveInviteProof(secret, 'group', joinerId, signingKey ?? (server.directory.get(joinerId)?.signingPublicKey as string));
}

describe('new members', () => {
  it('join with the invite link and get the current generation once members check the proof the server forwards', async () => {
    const { ana, bia } = await establishGroup();
    server.requireRotation('group');
    await settle();
    const current = ana.roomKeys.getCurrentRoomKey('group');
    expect(current?.epoch).toBe(2);

    const davi = await loadClient('davi');
    await joinGroup(davi, 'group', bia);

    const room = server.rooms.get('group') as ServerRoom;
    expect(room.members).toContain('davi');
    const daviRequests = server.keyRequests.filter((entry) => entry.userId === 'davi');
    expect(daviRequests.length).toBeGreaterThan(0);
    expect(daviRequests.every((entry) => JSON.stringify(entry.payload) === JSON.stringify({ roomId: 'group' }))).toBe(true);
    expect(davi.roomKeys.getCurrentRoomKey('group')?.keyId).toBe(current?.keyId);
    expect(server.envelopes.filter((entry) => entry.recipientId === 'davi').map((entry) => entry.epoch)).toEqual([2]);
    expect(keyRequestRejections()).toEqual([]);
  });

  it('are refused by the server when the link token is wrong', async () => {
    await establishGroup();
    const davi = await loadClient('davi');
    const errors: { code?: string }[] = [];
    davi.socket.on('error', (payload: { code?: string }) => errors.push(payload));
    davi.socket.emit('room:join-by-invite', await davi.roomKeys.prepareInviteJoin('group', crypto.getRandomValues(new Uint8Array(16))));
    await settle();

    expect(errors.map((error) => error.code)).toEqual(['room.invalidInvite']);
    expect((server.rooms.get('group') as ServerRoom).members).not.toContain('davi');
  });

  it('ask for a missing group key with only the room id, even without the link secret in memory', async () => {
    const { ana } = await establishGroup();
    const davi = await loadClient('davi');
    await joinGroup(davi, 'group', ana);

    const fresh = await loadClient('davi', { store: 'fresh-davi', privateKey: davi.privateKey });
    server.envelopes = server.envelopes.filter((entry) => entry.recipientId !== 'davi');
    await track(fresh, 'group');
    await settle();

    expect(fresh.socket.emittedOf('e2e:request-room-key')).toEqual([{ roomId: 'group' }]);
    expect(fresh.roomKeys.getCurrentRoomKey('group')?.keyId).toBe(server.rooms.get('group')?.currentKeyId);
  });

  it.each([
    ['no stored proof', 'missing-proof', () => Promise.resolve(undefined)],
    ['a proof made with another secret', 'invalid-proof', () => proofFor(crypto.getRandomValues(new Uint8Array(16)), 'davi')],
    ['a proof made for another joiner', 'invalid-proof', (secret: Uint8Array) => proofFor(secret, 'eva', server.directory.get('davi')?.signingPublicKey)],
    [
      'a proof bound to a signing key other than the pinned one',
      'invalid-proof',
      async (secret: Uint8Array) => {
        const sodium = await (await import('./sodium')).getSodium();
        return proofFor(secret, 'davi', sodium.to_base64(sodium.crypto_sign_keypair().publicKey));
      },
    ],
  ])('never receive the key with %s', async (_label, reason, makeProof) => {
    const { ana } = await establishGroup();
    const secret = await secretFromLink((await inviteLink(ana, 'group')) as string);
    const davi = await loadClient('davi');
    addMember('group', 'davi', await makeProof(secret));
    await settle();

    davi.socket.emit('e2e:request-room-key', { roomId: 'group' });
    await settle();

    expect(server.envelopes.filter((entry) => entry.recipientId === 'davi')).toEqual([]);
    expect(keyRequestRejections()).toEqual([reason, reason]);
  });

  it('get no key from members while they are not in the member list', async () => {
    const { ana } = await establishGroup();
    const secret = await secretFromLink((await inviteLink(ana, 'group')) as string);
    const davi = await loadClient('davi');
    (server.rooms.get('group') as ServerRoom).inviteProofs.set('davi', await proofFor(secret, 'davi'));

    davi.socket.emit('e2e:request-room-key', { roomId: 'group' });
    await settle();

    expect(server.envelopes.filter((entry) => entry.recipientId === 'davi')).toEqual([]);
    expect(keyRequestRejections()).toEqual(['not-member', 'not-member']);
  });

  it('still get the key without a proof in private rooms', async () => {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    createRoom('direct', 'private', 'ana', ['ana', 'bia']);
    server.sockets.delete('bia');
    await track(ana, 'direct', true);
    await settle();

    server.envelopes = server.envelopes.filter((entry) => entry.recipientId !== 'bia');
    server.sockets.set('bia', bia.socket);
    await track(bia, 'direct');
    await settle();

    expect(bia.socket.emittedOf('e2e:request-room-key')).toEqual([{ roomId: 'direct' }]);
    expect(bia.roomKeys.getCurrentRoomKey('direct')?.keyId).toBe(server.rooms.get('direct')?.currentKeyId);
  });
});

describe('verified roster', () => {
  it('starts with only the creator, sealed under the new key for the room and key id', async () => {
    const ana = await loadClient('ana');
    createRoom('group', 'group', 'ana', ['ana']);
    await track(ana, 'group');
    await settle();

    const [batch] = batchesOf(ana, 1);
    expect(batch?.roster?.startsWith(`e2e:v2:${batch.keyId}:`)).toBe(true);
    expect(await rosterOf(ana, batch as PublishedBatch)).toEqual({
      epoch: 1,
      members: [{ userId: 'ana', signingPublicKey: server.directory.get('ana')?.signingPublicKey }],
    });
    const invite = await import('./group-invite');
    const key = ana.roomKeys.getRoomKeyGeneration('group', batch?.keyId as string) as Uint8Array;
    expect(await invite.openRoster(batch?.roster as string, key, 'other', batch?.keyId as string, 1)).toBeNull();
  });

  it('keeps the creator from sealing the first generation to members it cannot verify', async () => {
    const ana = await loadClient('ana');
    await loadClient('bia');
    createRoom('group', 'group', 'ana', ['ana', 'bia']);
    await track(ana, 'group');
    await settle();

    expect(batchesOf(ana)).toEqual([]);
    expect(server.envelopes).toEqual([]);
    expect(unverifiedWarnings()).toEqual([{ roomId: 'group', epoch: 1, unverified: 1 }]);
  });

  it('seals a rotation to roster members and to joiners with a valid proof, and lists them all in the new roster', async () => {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    const caio = await loadClient('caio');
    await formGroup('group', 'ana', [ana, bia, caio]);

    server.requireRotation('group');
    await settle();

    const winner = [...batchesOf(ana, 2), ...batchesOf(bia, 2), ...batchesOf(caio, 2)].find(
      (batch) => batch.keyId === server.rooms.get('group')?.currentKeyId,
    ) as PublishedBatch;
    expect(winner.keys.map((key) => key.userId).sort()).toEqual(['ana', 'bia', 'caio']);
    const roster = await rosterOf(ana, winner);
    expect(roster?.members.map((member) => member.userId).sort()).toEqual(['ana', 'bia', 'caio']);
    expect(roster?.members.find((member) => member.userId === 'caio')?.signingPublicKey).toBe(server.directory.get('caio')?.signingPublicKey);
  });

  it('keeps covering roster members after their join proofs are gone', async () => {
    const { ana, bia } = await establishGroup();
    server.requireRotation('group');
    await settle();
    (server.rooms.get('group') as ServerRoom).inviteProofs.clear();

    server.requireRotation('group');
    await settle();

    expect(server.rooms.get('group')?.currentEpoch).toBe(3);
    expect(bia.roomKeys.getCurrentRoomKey('group')?.keyId).toBe(ana.roomKeys.getCurrentRoomKey('group')?.keyId);
  });

  it.each([
    ['without any proof', () => Promise.resolve(undefined)],
    ['whose proof was made with another secret', () => proofFor(crypto.getRandomValues(new Uint8Array(16)), 'eve')],
  ])('never seals a rotation when a member joined %s', async (_label, makeProof) => {
    const { ana, bia } = await establishGroup();
    await loadClient('eve');
    addMember('group', 'eve', await makeProof());
    await settle();

    server.requireRotation('group');
    await settle();

    expect([...batchesOf(ana, 2), ...batchesOf(bia, 2)]).toEqual([]);
    expect(server.envelopes.filter((entry) => entry.recipientId === 'eve')).toEqual([]);
    expect(server.rooms.get('group')?.rotationRequired).toBe(2);
    const warnings = unverifiedWarnings();
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((entry) => JSON.stringify(Object.keys(entry as object).sort()) === '["epoch","roomId","unverified"]')).toBe(true);
  });

  it('never seals a rotation to a joiner whose proof matches an invite replaced by a reset', async () => {
    const { ana, bia } = await establishGroup();
    const oldSecret = await secretFromLink((await inviteLink(ana, 'group')) as string);
    expect(await bia.roomKeys.resetGroupInvite(bia.socket.asAppSocket(), 'group')).toBe(true);

    await loadClient('eve');
    addMember('group', 'eve', await proofFor(oldSecret, 'eve'));
    await settle();
    server.requireRotation('group');
    await settle();

    expect(server.rooms.get('group')?.currentEpoch).toBe(2);
    expect(server.envelopes.filter((entry) => entry.recipientId === 'eve')).toEqual([]);
  });
});

describe('group invite links', () => {
  it('are created with the first generation and rotated with every new generation', async () => {
    const { ana, bia } = await establishGroup();
    const room = server.rooms.get('group') as ServerRoom;
    const [batch] = batchesOf(ana, 1);
    expect(batch?.invite?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(batch?.invite?.encryptedInvite.startsWith(`e2e:v2:${batch?.keyId}:`)).toBe(true);

    const first = await inviteLink(ana, 'group');
    expect(first).toMatch(/^https:\/\/spark\.test\/app\/#join=group\.[A-Za-z0-9_-]{22}$/);
    expect(await inviteLink(bia, 'group')).toBe(first);
    const invite = await import('./group-invite');
    expect(await invite.hashInviteToken(await invite.deriveInviteToken(await secretFromLink(first as string)))).toBe(room.tokenHash);

    server.requireRotation('group', 'bia');
    await settle();
    const [rotation] = batchesOf(ana, 2);
    expect(rotation?.invite?.tokenHash).not.toBe(batch?.invite?.tokenHash);
    expect(room.invite?.keyId).toBe(room.currentKeyId);

    const second = await inviteLink(ana, 'group');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(await invite.hashInviteToken(await invite.deriveInviteToken(await secretFromLink(second as string)))).toBe(room.tokenHash);
  });

  it('are not part of private room batches', async () => {
    const ana = await loadClient('ana');
    await loadClient('bia');
    createRoom('direct', 'private', 'ana', ['ana', 'bia']);
    await track(ana, 'direct', true);
    await settle();

    const [batch] = batchesOf(ana);
    expect(batch).toBeDefined();
    expect(batch?.invite).toBeUndefined();
    expect(batch?.roster).toBeUndefined();
    expect(await inviteLink(ana, 'direct')).toBeNull();
  });

  it('can be reset by any member, which succeeds only once the new generation is confirmed', async () => {
    const { ana, bia } = await establishGroup();
    const room = server.rooms.get('group') as ServerRoom;
    const oldLink = await inviteLink(ana, 'group');
    const oldSecret = await secretFromLink(oldLink as string);

    let finished = false;
    const reset = bia.roomKeys.resetGroupInvite(bia.socket.asAppSocket(), 'group').then((done) => {
      finished = true;
      return done;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(await reset).toBe(true);
    expect(bia.socket.emittedOf('room:reset-invite')).toEqual([{ roomId: 'group' }]);
    expect(room.currentEpoch).toBe(2);
    expect(bia.roomKeys.getCurrentRoomKey('group')?.epoch).toBe(2);
    await settle();

    const newLink = await inviteLink(ana, 'group');
    expect(newLink).not.toBeNull();
    expect(newLink).not.toBe(oldLink);
    expect(await inviteLink(bia, 'group')).toBe(newLink);

    const davi = await loadClient('davi');
    const errors: { code?: string }[] = [];
    davi.socket.on('error', (payload: { code?: string }) => errors.push(payload));
    davi.socket.emit('room:join-by-invite', await davi.roomKeys.prepareInviteJoin('group', oldSecret));
    await settle();
    expect(errors.map((error) => error.code)).toEqual(['room.invalidInvite']);
  });

  it('fail a reset only for the room named in the error', async () => {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    await formGroup('one', 'ana', [ana, bia]);
    await formGroup('two', 'ana', [ana, bia]);
    server.failResets.add('one');

    const [one, two] = await Promise.all([
      bia.roomKeys.resetGroupInvite(bia.socket.asAppSocket(), 'one', 2000),
      bia.roomKeys.resetGroupInvite(bia.socket.asAppSocket(), 'two', 2000),
    ]);

    expect(one).toBe(false);
    expect(two).toBe(true);
    expect(server.rooms.get('two')?.currentEpoch).toBe(2);
  });

  it('stay unavailable after the server clears them until the next generation brings a new one', async () => {
    const { ana } = await establishGroup();
    const room = server.rooms.get('group') as ServerRoom;
    server.deactivateInvite(room);
    server.push('ana', 'room:invite-updated', { roomId: 'group', invite: room.invite, roster: room.roster });

    expect(await inviteLink(ana, 'group')).toBeNull();
    expect(ana.roomKeys.isGroupInviteCleared('group')).toBe(true);
    expect(ana.socket.emittedOf('rooms:get')).toEqual([]);

    server.requireRotation('group', 'bia');
    await settle();
    expect(ana.roomKeys.isGroupInviteCleared('group')).toBe(false);
    expect(await inviteLink(ana, 'group')).not.toBeNull();
  });
});

describe('second review hardening', () => {
  function relabelAsPrivate(roomId: string): RoomSummary {
    return { ...server.summary(roomId), type: 'private' };
  }

  it('never downgrades a known group to a private room', async () => {
    const { ana, bia } = await establishGroup();
    await ana.roomKeys.trackRoom(ana.socket.asAppSocket(), relabelAsPrivate('group'));
    await bia.roomKeys.trackRoom(bia.socket.asAppSocket(), relabelAsPrivate('group'));
    const eve = await loadClient('eve');
    addMember('group', 'eve');
    await settle();

    eve.socket.emit('e2e:request-room-key', { roomId: 'group' });
    await settle();
    expect(keyRequestRejections()).toEqual(['missing-proof', 'missing-proof']);

    server.requireRotation('group');
    await settle();
    expect(server.envelopes.filter((entry) => entry.recipientId === 'eve')).toEqual([]);
    expect(server.rooms.get('group')?.currentEpoch).toBe(1);
  });

  it('remembers a group from the device store after a reload even if the server relabels it', async () => {
    const { ana } = await establishGroup();
    const reloaded = await loadClient('ana', { store: 'ana', privateKey: ana.privateKey });
    await reloaded.roomKeys.trackRoom(reloaded.socket.asAppSocket(), relabelAsPrivate('group'));
    await settle();
    const eve = await loadClient('eve');
    addMember('group', 'eve');
    await settle();

    eve.socket.emit('e2e:request-room-key', { roomId: 'group' });
    await settle();

    expect(server.envelopes.filter((entry) => entry.recipientId === 'eve')).toEqual([]);
    expect(keyRequestRejections()).toContain('missing-proof');
  });

  it('verifies pending joiners with the inactive invite from the summary after a reload', async () => {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    const davi = await loadClient('davi');
    await formGroup('group', 'ana', [ana, bia, davi]);
    const room = server.rooms.get('group') as ServerRoom;
    server.sockets.delete('bia');
    server.sockets.delete('davi');
    server.deactivateInvite(room);
    room.rotationRequired = 2;

    const reloaded = await loadClient('ana', { store: 'ana', privateKey: ana.privateKey });
    await track(reloaded, 'group');
    await settle();

    expect(room.currentEpoch).toBe(2);
    expect(server.envelopes.filter((entry) => entry.epoch === 2).map((entry) => entry.recipientId).sort()).toEqual(['ana', 'bia', 'davi']);
    expect(await inviteLink(reloaded, 'group')).not.toBeNull();
  });

  it('shows no link while the invite is inactive', async () => {
    const { ana } = await establishGroup();
    const room = server.rooms.get('group') as ServerRoom;
    server.deactivateInvite(room);
    server.push('ana', 'room:invite-updated', { roomId: 'group', invite: room.invite, roster: room.roster });

    expect(room.invite?.active).toBe(false);
    expect(await inviteLink(ana, 'group')).toBeNull();
    expect(ana.roomKeys.isGroupInviteCleared('group')).toBe(true);
  });

  it('refuses to seal when a roster signing key differs from the pinned one', async () => {
    const { ana } = await establishGroup();
    server.requireRotation('group');
    await settle();
    const room = server.rooms.get('group') as ServerRoom;
    const invite = await import('./group-invite');
    const sodium = await (await import('./sodium')).getSodium();
    const key = ana.roomKeys.getRoomKeyGeneration('group', room.currentKeyId as string) as Uint8Array;
    const forged = await invite.sealRoster(
      {
        epoch: 2,
        members: [
          { userId: 'ana', signingPublicKey: server.directory.get('ana')?.signingPublicKey as string },
          { userId: 'bia', signingPublicKey: sodium.to_base64(sodium.crypto_sign_keypair().publicKey) },
        ],
      },
      key,
      'group',
      room.currentKeyId as string,
    );
    room.roster = { encryptedRoster: forged, keyId: room.currentKeyId as string };
    server.pushInvite('group');
    await settle();

    server.requireRotation('group');
    await settle();

    expect(room.currentEpoch).toBe(2);
    expect(warn).toHaveBeenCalledWith('[e2e] refused a group roster whose signing key differs from the pinned one', expect.anything());
  });

  it('relies on proofs only when the roster is not from the epoch right before the new one', async () => {
    const { ana, bia } = await establishGroup();
    server.requireRotation('group');
    await settle();
    const room = server.rooms.get('group') as ServerRoom;
    expect(room.currentEpoch).toBe(2);
    room.inviteProofs.clear();
    room.rotationRequired = 4;
    for (const member of room.members) {
      server.push(member, 'e2e:rotation-required', { roomId: 'group', epoch: 4, memberIds: room.members, inviteProofs: [] });
    }
    await settle();

    expect([...batchesOf(ana, 4), ...batchesOf(bia, 4)]).toEqual([]);
    expect(room.currentEpoch).toBe(2);
  });
});

describe('member key changes in a group roster', () => {
  async function groupAtEpochTwoWithChangedBia(): Promise<Client> {
    const { ana } = await establishGroup();
    server.sockets.delete('bia');
    server.requireRotation('group');
    await settle();
    expect(server.rooms.get('group')?.currentEpoch).toBe(2);
    await rekey('bia');
    await ana.roomKeys.lookupContactKey(ana.socket.asAppSocket(), 'bia');
    return ana;
  }

  function accept(client: Client, contactId: string): Promise<unknown> {
    return client.trust.acceptContactKeyChange({ userId: client.userId, publicKey: client.publicKey }, contactId);
  }

  it('include a member whose changed key this user accepted, so the rotation completes', async () => {
    const ana = await groupAtEpochTwoWithChangedBia();
    await accept(ana, 'bia');

    server.requireRotation('group');
    await settle();

    expect(server.rooms.get('group')?.currentEpoch).toBe(3);
    const [batch] = batchesOf(ana, 3);
    const roster = await rosterOf(ana, batch as PublishedBatch);
    expect(roster?.members.find((member) => member.userId === 'bia')?.signingPublicKey).toBe(server.directory.get('bia')?.signingPublicKey);
  });

  it('hold the rotation while the change is not accepted, show the warning, and finish it after acceptance', async () => {
    const ana = await groupAtEpochTwoWithChangedBia();

    server.requireRotation('group');
    await settle();
    expect(server.rooms.get('group')?.currentEpoch).toBe(2);
    expect(server.envelopes.filter((entry) => entry.epoch === 3)).toEqual([]);
    expect(ana.trust.getContactTrust('bia')?.status).toBe('changed');
    expect(ana.roomKeys.isRotationBlockedBy('group', 'bia')).toBe(true);
    expect(ana.roomKeys.isRotationBlockedBy('group', 'ana')).toBe(false);
    const notified: string[] = [];
    const stop = ana.roomKeys.subscribeRotationBlocks((roomId) => notified.push(roomId));

    await accept(ana, 'bia');
    await settle();
    stop();

    expect(server.rooms.get('group')?.currentEpoch).toBe(3);
    expect(ana.roomKeys.getCurrentRoomKey('group')?.epoch).toBe(3);
    expect(ana.roomKeys.isRotationBlockedBy('group', 'bia')).toBe(false);
    expect(notified).toContain('group');
  });

  it('never include a member whose roster key differs from a pin this user did not accept', async () => {
    const ana = await groupAtEpochTwoWithChangedBia();
    const room = server.rooms.get('group') as ServerRoom;
    const fresh = await loadClient('ana', { store: 'fresh-ana', privateKey: ana.privateKey });
    await track(fresh, 'group');
    await settle();
    server.requireRotation('group');
    await settle();

    expect(fresh.trust.getContactTrust('bia')?.pin?.replacedSigningPublicKey).toBeUndefined();
    expect(room.currentEpoch).toBe(2);
    expect(warn).toHaveBeenCalledWith('[e2e] refused a group roster whose signing key differs from the pinned one', expect.anything());
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

    expect(bia.socket.emittedOf('e2e:get-room-keys')).toEqual([{ roomIds: ['dm'], keyIds: { dm: [unknown] } }]);

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
    await formGroup('group', memberIds[0] as string, clients);
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
});

async function rekey(userId: string): Promise<void> {
  const sodium = await (await import('./sodium')).getSodium();
  const signing = await import('./signing');
  const pair = sodium.crypto_box_keypair();
  const publicKey = sodium.to_base64(pair.publicKey);
  server.directory.set(userId, { userId, publicKey, ...(await signing.buildSigningProof(userId, publicKey, pair.privateKey)) });
}

describe('review hardening', () => {
  async function groupAtEpochOne(creatorId: string, memberIds: string[]): Promise<Client[]> {
    const clients: Client[] = [];
    for (const id of memberIds) {
      clients.push(await loadClient(id));
    }
    await formGroup('group', creatorId, clients);
    return clients;
  }

  it('rejects the next epoch injected by a removed member', async () => {
    const [, bia, caio] = await groupAtEpochOne('ana', ['ana', 'bia', 'caio']);
    if (!bia || !caio) {
      throw new Error('clients missing');
    }
    const room = server.rooms.get('group') as ServerRoom;
    room.members = ['ana', 'bia'];
    bia.roomKeys.updateRoomParticipants('group', room.members.map((id) => ({ id, nickname: id })) as never);

    await bia.roomKeys.handleRoomKeyPush(bia.socket.asAppSocket(), await forgeEnvelope(caio, bia, { roomId: 'group', epoch: 2 }));

    expect(bia.roomKeys.getCurrentRoomKey('group')?.epoch).toBe(1);
    expect(discardReasons()).toContain('non-member-sender');
  });

  async function rotateWith(firstId: string, removedUserId?: string): Promise<void> {
    const room = server.rooms.get('group') as ServerRoom;
    const detached = Array.from(server.sockets).filter(([id]) => id !== firstId);
    for (const [id] of detached) {
      server.sockets.delete(id);
    }
    server.requireRotation('group', removedUserId);
    await settle();
    await settle();
    for (const [id, socket] of detached) {
      server.sockets.set(id, socket);
    }
    const participants = room.members.map((id) => ({ id, nickname: id }));
    for (const member of room.members.filter((id) => id !== firstId)) {
      server.push(member, 'group:user-joined', { roomId: 'group', participants });
      for (const { recipientId, ...entry } of server.envelopes.filter((stored) => stored.recipientId === member && stored.epoch === room.currentEpoch)) {
        server.push(recipientId, 'e2e:room-key', entry);
      }
    }
    await settle();
  }

  it('accepts a historical generation from a former member attested by the roster of a generation it already trusts', async () => {
    const [, bia, caio] = await groupAtEpochOne('ana', ['ana', 'bia', 'caio']);
    if (!bia || !caio) {
      throw new Error('clients missing');
    }
    await rotateWith('ana');
    await rotateWith('caio');
    const third = server.envelopes.find((entry) => entry.epoch === 3);
    expect(third?.senderId).toBe('caio');
    const fromFormerMember = await sendText(caio, 'group', 'sent before leaving');
    await rotateWith('ana', 'caio');
    expect(server.rooms.get('group')?.currentEpoch).toBe(4);

    const fresh = await loadClient('bia', { store: 'fresh-bia', privateKey: bia.privateKey });
    await track(fresh, 'group');
    await settle();

    expect(await readText(fresh, fromFormerMember)).toBe('sent before leaving');
    expect(fresh.roomKeys.getCurrentRoomKey('group')?.epoch).toBe(4);
    expect(fresh.roomKeys.getRoomKeyGeneration('group', third?.keyId as string)).not.toBeNull();
  });

  it('asks again with key ids for the rosters a truncated response left out', async () => {
    const [, bia, caio] = await groupAtEpochOne('ana', ['ana', 'bia', 'caio']);
    if (!bia || !caio) {
      throw new Error('clients missing');
    }
    await rotateWith('ana');
    await rotateWith('caio');
    const fromFormerMember = await sendText(caio, 'group', 'sent before leaving');
    await rotateWith('ana', 'caio');
    server.truncateRosters = true;

    const fresh = await loadClient('bia', { store: 'fresh-bia', privateKey: bia.privateKey });
    await track(fresh, 'group');
    await settle();

    expect(await readText(fresh, fromFormerMember)).toBe('sent before leaving');
    const secondKeyId = server.envelopes.find((entry) => entry.epoch === 2)?.keyId as string;
    const requests = fresh.socket.emittedOf('e2e:get-room-keys') as { keyIds?: Record<string, string[]> }[];
    expect(requests.some((request) => request.keyIds?.group?.includes(secondKeyId))).toBe(true);
  });

  it('rejects a historical generation from a former member that only its own roster attests', async () => {
    const [, bia, caio] = await groupAtEpochOne('ana', ['ana', 'bia', 'caio']);
    if (!bia || !caio) {
      throw new Error('clients missing');
    }
    await rotateWith('ana', 'caio');
    const fresh = await loadClient('bia', { store: 'fresh-bia', privateKey: bia.privateKey });
    await track(fresh, 'group');
    await settle();
    expect(fresh.roomKeys.getCurrentRoomKey('group')?.epoch).toBe(2);

    const envelope = await import('./room-key-envelope');
    const signing = await import('./signing');
    const invite = await import('./group-invite');
    const pair = await signing.deriveSigningKeyPair(caio.privateKey);
    const roomKey = crypto.getRandomValues(new Uint8Array(32));
    const keyId = await envelope.deriveRoomKeyId(roomKey);
    const roster = await invite.sealRoster(
      { epoch: 1, members: [{ userId: 'caio', signingPublicKey: server.directory.get('caio')?.signingPublicKey as string }] },
      roomKey,
      'group',
      keyId,
    );
    const sealedKey = await envelope.sealRoomKeyEnvelope({
      roomKey,
      roomId: 'group',
      keyId,
      epoch: 1,
      senderId: 'caio',
      senderPrivateKey: caio.privateKey,
      senderSigningPrivateKey: pair.privateKey,
      recipientId: 'bia',
      recipientPublicKey: bia.publicKey,
    });

    await fresh.roomKeys.handleRoomKeyPush(fresh.socket.asAppSocket(), { roomId: 'group', keyId, epoch: 1, senderId: 'caio', sealedKey, roster });

    expect(fresh.roomKeys.getRoomKeyGeneration('group', keyId)).toBeNull();
    expect(discardReasons()).toContain('unattested-sender');
    expect(fresh.roomKeys.getCurrentRoomKey('group')?.epoch).toBe(2);
  });

  it('rejects a historical generation from a former member missing from the trusted previous roster', async () => {
    const [ana, bia, caio] = await groupAtEpochOne('ana', ['ana', 'bia', 'caio']);
    if (!ana || !bia || !caio) {
      throw new Error('clients missing');
    }
    await rotateWith('ana', 'caio');
    await rotateWith('ana');
    const firstKeyId = server.envelopes.find((entry) => entry.epoch === 1)?.keyId as string;
    const fresh = await loadClient('bia', { store: 'fresh-bia', privateKey: bia.privateKey });
    await track(fresh, 'group');
    await settle();
    expect(await fresh.roomKeys.ensureRoomKeyGeneration(fresh.socket.asAppSocket(), 'group', firstKeyId)).not.toBeNull();
    expect(fresh.roomKeys.getCurrentRoomKey('group')?.epoch).toBe(3);

    const forged = await forgeEnvelope(caio, bia, { roomId: 'group', epoch: 2 });
    await fresh.roomKeys.handleRoomKeyPush(fresh.socket.asAppSocket(), forged);

    expect(discardReasons()).toContain('unattested-sender');
    expect(fresh.roomKeys.getRoomKeyGeneration('group', forged.keyId)).toBeNull();
  });

  it('rejects a different key shared to a newcomer under the current key id', async () => {
    const [, bia] = await groupAtEpochOne('ana', ['ana', 'bia']);
    if (!bia) {
      throw new Error('client missing');
    }
    const room = server.rooms.get('group') as ServerRoom;
    const davi = await loadClient('davi');
    room.members.push('davi');
    server.sockets.delete('ana');
    server.sockets.delete('bia');
    await track(davi, 'group');

    const forged = await forgeEnvelope(bia, davi, { roomId: 'group', epoch: 1, keyId: room.currentKeyId as string });
    await davi.roomKeys.handleRoomKeyPush(davi.socket.asAppSocket(), forged);

    expect(davi.roomKeys.getCurrentRoomKey('group')).toBeNull();
    expect(discardReasons()).toContain('key-mismatch');
  });

  async function rotationAfterKeyChange(otherId: string, type: 'private' | 'group', nickname?: string): Promise<number> {
    const ana = await loadClient('ana');
    const other = await loadClient(otherId);
    if (nickname) {
      server.nicknames.set(otherId, nickname);
    }
    if (type === 'group') {
      await formGroup('room', 'ana', [ana, other]);
    } else {
      createRoom('room', type, 'ana', ['ana', otherId]);
      await track(ana, 'room', true);
      await settle();
    }
    expect(server.rooms.get('room')?.currentEpoch).toBe(1);

    await rekey(otherId);
    server.requireRotation('room');
    await settle();
    return (ana.socket.emittedOf('e2e:publish-room-key') as { epoch: number }[]).filter((batch) => batch.epoch === 2).length;
  }

  it('still seals to the server-managed assistant by its fixed id in a private room', async () => {
    expect(await rotationAfterKeyChange('spark-ai', 'private')).toBe(1);
  });

  it('never treats a member as the assistant because of its nickname', async () => {
    expect(await rotationAfterKeyChange('impostor', 'private', 'SparkAI')).toBe(0);
  });

  it('never treats the assistant id as server-managed in a group', async () => {
    expect(await rotationAfterKeyChange('spark-ai', 'group', 'SparkAI')).toBe(0);
  });

  async function queuedRoomKey(junk: (index: number) => SealedRoomKeyEntry, count: number): Promise<RoomKeysNamespace.RoomKeyGeneration | null> {
    const ana = await loadClient('ana');
    const bia = await loadClient('bia');
    createRoom('dm', 'private', 'ana', ['ana', 'bia']);
    await track(ana, 'dm');
    await bia.roomKeys.handleRoomKeyPush(bia.socket.asAppSocket(), await forgeEnvelope(ana, bia, { roomId: 'dm', epoch: 1 }));
    for (let index = 0; index < count; index += 1) {
      await bia.roomKeys.handleRoomKeyPush(bia.socket.asAppSocket(), junk(index));
    }
    await track(bia, 'dm');
    return bia.roomKeys.getCurrentRoomKey('dm');
  }

  const junkFor = (roomId: string) => ({ roomId, keyId: 'A'.repeat(22), epoch: 1, senderId: 'ana', sealedKey: 'junk' });

  it('keeps a queued envelope while the per-room queue has room', async () => {
    expect(await queuedRoomKey(() => junkFor('dm'), 49)).not.toBeNull();
  });

  it('drops the oldest queued envelope of a room past the per-room cap', async () => {
    expect(await queuedRoomKey(() => junkFor('dm'), 50)).toBeNull();
  });

  it('drops the oldest queued envelope past the total cap', async () => {
    expect(await queuedRoomKey((index) => junkFor(`room-${index}`), 500)).toBeNull();
  });
});

describe('encrypted group name', () => {
  it('is sealed under the first generation by the creator and never sent in plaintext', async () => {
    const { ana, bia } = await establishGroup();
    const [batch] = batchesOf(ana, 1);
    expect(batch?.name).toEqual(expect.any(String));
    expect(JSON.stringify(ana.socket.emitted)).not.toContain(GROUP_NAME);
    const invite = await import('./group-invite');
    const key = ana.roomKeys.getRoomKeyGeneration('group', batch?.keyId as string) as Uint8Array;
    expect(await invite.openRoomName(batch?.name as string, key, 'group', batch?.keyId as string)).toBe(GROUP_NAME);
    expect(ana.roomKeys.getRoomName('group')).toBe(GROUP_NAME);
    expect(await bia.roomKeys.resolveRoomName(bia.socket.asAppSocket(), server.summary('group'))).toBe(GROUP_NAME);
  });

  it('is re-encrypted under every new generation by the rotator', async () => {
    const { ana, bia } = await establishGroup();
    server.requireRotation('group');
    await settle();
    await settle();
    const room = server.rooms.get('group') as ServerRoom;
    expect(room.currentEpoch).toBe(2);
    expect(room.encryptedName?.keyId).toBe(room.currentKeyId);
    const winning = [...batchesOf(ana, 2), ...batchesOf(bia, 2)].find((batch) => batch.keyId === room.currentKeyId);
    expect(winning?.name).toBe(room.encryptedName?.encryptedName);
    const fresh = await loadClient('bia', { store: 'fresh-bia', privateKey: bia.privateKey });
    await track(fresh, 'group');
    await settle();
    expect(await fresh.roomKeys.resolveRoomName(fresh.socket.asAppSocket(), server.summary('group'))).toBe(GROUP_NAME);
  });

  it('still rotates with the placeholder name when the rotator cannot decrypt the current name', async () => {
    const { ana, bia } = await establishGroup();
    const room = server.rooms.get('group') as ServerRoom;
    room.encryptedName = { encryptedName: 'e2e:v2:garbage', keyId: room.currentKeyId as string };
    const freshAna = await loadClient('ana', { store: 'fresh-ana', privateKey: ana.privateKey });
    const freshBia = await loadClient('bia', { store: 'fresh-bia', privateKey: bia.privateKey });
    await Promise.all([freshAna.roomKeys.trackRoom(freshAna.socket.asAppSocket(), server.summary('group')), track(freshBia, 'group')]);
    await settle();
    server.requireRotation('group', 'bia');
    await settle();
    await settle();

    expect(room.currentEpoch).toBe(2);
    const invite = await import('./group-invite');
    const key = freshAna.roomKeys.getRoomKeyGeneration('group', room.currentKeyId as string) as Uint8Array;
    expect(await invite.openRoomName(room.encryptedName?.encryptedName, key, 'group', room.currentKeyId as string)).toBe('common.group');
  });

  it('shows no name until it opens and rejects a blob bound to another room', async () => {
    const { bia } = await establishGroup();
    const invite = await import('./group-invite');
    const generation = bia.roomKeys.getCurrentRoomKey('group') as { keyId: string; key: Uint8Array };
    const otherRoom = await invite.sealRoomName('Hijacked', generation.key, 'other', generation.keyId);
    const fresh = await loadClient('bia', { store: 'fresh-bia', privateKey: bia.privateKey });
    const room = server.rooms.get('group') as ServerRoom;
    room.encryptedName = { encryptedName: otherRoom, keyId: generation.keyId };
    await track(fresh, 'group');
    expect(await fresh.roomKeys.resolveRoomName(fresh.socket.asAppSocket(), server.summary('group'))).toBeNull();
    expect(warn).toHaveBeenCalledWith('[e2e] discarded a group name that does not open with its room key', { roomId: 'group' });
  });

  it('renames with a blob under the current key that every member decrypts', async () => {
    const { ana, bia } = await establishGroup();
    expect(await ana.roomKeys.renameGroup(ana.socket.asAppSocket(), 'group', 'New name')).toBe(true);
    await settle();
    const [rename] = ana.socket.emittedOf('room:rename') as { roomId: string; name: string; keyId: string }[];
    expect(rename?.keyId).toBe(server.rooms.get('group')?.currentKeyId);
    expect(rename?.name).not.toContain('New name');
    expect(bia.roomKeys.getRoomName('group')).toBe('New name');
    expect(await ana.roomKeys.renameGroup(ana.socket.asAppSocket(), 'group', '  ')).toBe(false);
  });

  it('lets only members of the current verified roster rename', async () => {
    const { ana, bia } = await establishGroup();
    expect(await ana.roomKeys.canRenameGroup(ana.socket.asAppSocket(), 'group')).toBe(true);
    expect(await bia.roomKeys.canRenameGroup(bia.socket.asAppSocket(), 'group')).toBe(false);
    expect(await bia.roomKeys.renameGroup(bia.socket.asAppSocket(), 'group', 'Taken over')).toBe(false);
    expect(bia.socket.emittedOf('room:rename')).toEqual([]);

    server.requireRotation('group');
    await settle();
    await settle();
    expect(await bia.roomKeys.canRenameGroup(bia.socket.asAppSocket(), 'group')).toBe(true);
  });

  it('ignores a name sealed under an older generation, so a rename cannot be rolled back', async () => {
    const { ana, bia } = await establishGroup();
    const room = server.rooms.get('group') as ServerRoom;
    const oldName = room.encryptedName as { encryptedName: string; keyId: string };
    server.requireRotation('group');
    await settle();
    await settle();
    expect(room.currentEpoch).toBe(2);
    await ana.roomKeys.renameGroup(ana.socket.asAppSocket(), 'group', 'Renamed');
    await settle();
    expect(bia.roomKeys.getRoomName('group')).toBe('Renamed');

    await bia.roomKeys.handleRoomNameUpdated(bia.socket.asAppSocket(), { roomId: 'group', ...oldName });

    expect(bia.roomKeys.getRoomName('group')).toBe('Renamed');
    expect(warn).toHaveBeenCalledWith('[e2e] ignored a group name that is not sealed under the current generation', { roomId: 'group' });
  });
});

describe('group summaries', () => {
  it('ignore a plaintext name from the server and show only the locally decrypted one', async () => {
    const { bia } = await establishGroup();
    const summary = { ...server.summary('group'), name: 'Injected', lastMessage: null } as RoomSummary;
    expect((await bia.messages.decryptRoomSummary(bia.socket.asAppSocket(), summary)).name).toBe(GROUP_NAME);

    const fresh = await loadClient('bia', { store: 'fresh-bia', privateKey: bia.privateKey });
    const withoutName = { ...summary, encryptedName: null } as RoomSummary;
    expect((await fresh.messages.decryptRoomSummary(fresh.socket.asAppSocket(), withoutName)).name).toBeUndefined();
  });
});

describe('missing generation lookups', () => {
  it('ask only for the missing key ids of a room', async () => {
    const { bia } = await establishGroup();
    server.requireRotation('group');
    await settle();
    const firstKeyId = server.envelopes.find((entry) => entry.epoch === 1)?.keyId as string;
    const fresh = await loadClient('bia', { store: 'fresh-bia', privateKey: bia.privateKey });
    await track(fresh, 'group');
    await settle();
    const currentKeyId = server.rooms.get('group')?.currentKeyId as string;
    expect(fresh.socket.emittedOf('e2e:get-room-keys')).toEqual([{ roomIds: ['group'], keyIds: { group: [currentKeyId] } }]);

    expect(await fresh.roomKeys.ensureRoomKeyGeneration(fresh.socket.asAppSocket(), 'group', firstKeyId)).not.toBeNull();
    expect(fresh.socket.emittedOf('e2e:get-room-keys').at(-1)).toEqual({ roomIds: ['group'], keyIds: { group: [firstKeyId] } });
  });

  it('never put more than 50 key ids of a room in one request', async () => {
    const { bia } = await establishGroup();
    bia.socket.emitted.length = 0;
    const ids = Array.from({ length: 60 }, (_, index) => `${String(index).padStart(2, '0')}${'A'.repeat(20)}`);
    await Promise.all(ids.map((id) => bia.roomKeys.ensureRoomKeyGeneration(bia.socket.asAppSocket(), 'group', id)));
    const requests = bia.socket.emittedOf('e2e:get-room-keys') as { keyIds: Record<string, string[]> }[];
    expect(requests.length).toBeGreaterThan(1);
    expect(requests.every((request) => (request.keyIds.group?.length ?? 0) <= 50)).toBe(true);
    expect(requests.flatMap((request) => request.keyIds.group ?? []).sort()).toEqual([...ids].sort());
  });
});
