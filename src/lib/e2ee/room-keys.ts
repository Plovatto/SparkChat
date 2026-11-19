import { translate } from '@lib/i18n/app-i18n';
import type { AppSocket, E2ePublicKeyEntry, RoomParticipant, RoomSummary, RoomType, SealedRoomKeyEntry } from '@lib/socket';
import { createBatchedLookup } from './batched-lookup';
import { ASSISTANT_USER_ID } from './assistant';
import { isKeyUsable, observeContactKey, type ContactTrust } from './contact-trust';
import { getCurrentIdentity, type CurrentIdentity } from './current-identity';
import { clearRoomKeyStore, loadRoomKeyGenerations, saveRoomKeyGeneration } from './key-store';
import { clearDecryptedMediaCache } from './media-cache';
import {
  deriveRoomKeyId,
  openRoomKeyEnvelope,
  ROOM_KEY_BYTES,
  RoomKeyEnvelopeError,
  sealRoomKeyEnvelope,
  type EnvelopeSender,
} from './room-key-envelope';
import { safeAsync } from './safe-async';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

export interface RoomKeyGeneration {
  keyId: string;
  epoch: number;
  key: Uint8Array;
}

interface RoomView {
  type: RoomType | null;
  creatorId: string | null;
  members: Set<string>;
  currentEpoch: number;
  rotationRequiredEpoch: number | null;
}

interface RoomKeyBundle {
  roomId: string;
  keys: SealedRoomKeyEntry[];
}

interface PendingPublish {
  epoch: number;
  startedAt: number;
}

const REQUEST_TIMEOUT_MS = 8000;

const MISSING_GENERATION_RETRY_MS = 30000;

export const MAX_ROOM_KEY_BATCH = 150;

const generationsByRoom = new Map<string, Map<string, RoomKeyGeneration>>();
const roomViews = new Map<string, RoomView>();
const persistedLoads = new Map<string, Promise<void>>();
const pendingSyncs = new Map<string, Promise<void>>();
const missingGenerations = new Map<string, number>();
const pendingPublishes = new Map<string, PendingPublish>();
const MAX_QUEUED_ENVELOPES_PER_ROOM = 50;
const MAX_QUEUED_ENVELOPES = 500;
let queuedEnvelopes: SealedRoomKeyEntry[] = [];
const ownSigningPublicKeys = new WeakMap<Uint8Array, string>();

function fetchRoomKeys(socket: AppSocket, roomIds: string[]): Promise<RoomKeyBundle[]> {
  return new Promise((resolve) => {
    const requested = new Set(roomIds);
    let settled = false;
    let timeoutId = 0;

    const finish = (value: RoomKeyBundle[]) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      socket.off('e2e:room-keys', handleKeys);
      resolve(value);
    };

    const handleKeys = (payload: { keys: SealedRoomKeyEntry[] }) => {
      const bundles = new Map<string, RoomKeyBundle>();
      for (const entry of payload.keys) {
        if (!requested.has(entry.roomId)) {
          continue;
        }
        const bundle = bundles.get(entry.roomId) ?? { roomId: entry.roomId, keys: [] };
        bundle.keys.push(entry);
        bundles.set(entry.roomId, bundle);
      }
      finish(Array.from(bundles.values()));
    };

    socket.on('e2e:room-keys', handleKeys);
    socket.emit('e2e:get-room-keys', { roomIds });
    timeoutId = window.setTimeout(() => finish([]), REQUEST_TIMEOUT_MS);
  });
}

function fetchPublicKeys(socket: AppSocket, userIds: string[]): Promise<E2ePublicKeyEntry[]> {
  return new Promise((resolve) => {
    const requested = new Set(userIds);
    let settled = false;
    let timeoutId = 0;

    const finish = (value: E2ePublicKeyEntry[]) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      socket.off('e2e:public-keys', handleKeys);
      resolve(value);
    };

    const handleKeys = (payload: { keys: E2ePublicKeyEntry[] }) => {
      finish(payload.keys.filter((entry) => requested.has(entry.userId)));
    };

    socket.on('e2e:public-keys', handleKeys);
    socket.emit('e2e:get-public-keys', { userIds });
    timeoutId = window.setTimeout(() => finish([]), REQUEST_TIMEOUT_MS);
  });
}

const lookupRoomKeyBundle = createBatchedLookup(fetchRoomKeys, (bundle) => bundle.roomId);
const lookupPublicKey = createBatchedLookup(fetchPublicKeys, (entry) => entry.userId);

export async function lookupContactKey(socket: AppSocket, userId: string): Promise<ContactTrust | null> {
  const identity = getCurrentIdentity();
  if (!identity) {
    return null;
  }
  const entry = await lookupPublicKey(socket, userId);
  if (!entry) {
    return null;
  }
  return observeContactKey({ userId: identity.userId, publicKey: identity.publicKey }, entry);
}

async function lookupUsableContactKey(socket: AppSocket, userId: string, serverManaged: boolean): Promise<string | null> {
  const identity = getCurrentIdentity();
  const entry = await lookupPublicKey(socket, userId);
  if (!identity || !entry) {
    return null;
  }
  if (serverManaged) {
    return entry.publicKey;
  }
  const trust = await observeContactKey({ userId: identity.userId, publicKey: identity.publicKey }, entry);
  return isKeyUsable(trust.status) ? entry.publicKey : null;
}

async function ownSigningPublicKey(identity: CurrentIdentity): Promise<string> {
  const cached = ownSigningPublicKeys.get(identity.privateKey);
  if (cached) {
    return cached;
  }
  const sodium = await getSodium();
  const pair = await deriveSigningKeyPair(identity.privateKey);
  pair.privateKey.fill(0);
  const encoded = sodium.to_base64(pair.publicKey);
  ownSigningPublicKeys.set(identity.privateKey, encoded);
  return encoded;
}

async function resolveEnvelopeSender(socket: AppSocket, identity: CurrentIdentity, senderId: string): Promise<EnvelopeSender | null> {
  if (senderId === identity.userId) {
    return { publicKey: identity.publicKey, signingPublicKey: await ownSigningPublicKey(identity) };
  }
  const trust = await lookupContactKey(socket, senderId);
  const pin = trust?.pin;
  if (!trust || trust.status === 'invalid' || !pin?.signingPublicKey) {
    return null;
  }
  return { publicKey: pin.publicKey, signingPublicKey: pin.signingPublicKey };
}

export type RoomKeyAvailableListener = (roomId: string) => void;

const roomKeyAvailableListeners = new Set<RoomKeyAvailableListener>();

export function subscribeRoomKeyAvailable(listener: RoomKeyAvailableListener): () => void {
  roomKeyAvailableListeners.add(listener);
  return () => {
    roomKeyAvailableListeners.delete(listener);
  };
}

function notifyRoomKeyAvailable(roomId: string): void {
  for (const listener of Array.from(roomKeyAvailableListeners)) {
    try {
      listener(roomId);
    } catch (error) {
      console.error('[e2e] room key listener failed', error);
    }
  }
}

function generationsOf(roomId: string): Map<string, RoomKeyGeneration> {
  let generations = generationsByRoom.get(roomId);
  if (!generations) {
    generations = new Map();
    generationsByRoom.set(roomId, generations);
  }
  return generations;
}

function latestGeneration(roomId: string): RoomKeyGeneration | null {
  let latest: RoomKeyGeneration | null = null;
  for (const generation of generationsByRoom.get(roomId)?.values() ?? []) {
    if (!latest || generation.epoch > latest.epoch) {
      latest = generation;
    }
  }
  return latest;
}

function missingKey(roomId: string, keyId: string): string {
  return `${roomId}\n${keyId}`;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function adoptGeneration(roomId: string, generation: RoomKeyGeneration, persist: boolean): boolean {
  const generations = generationsOf(roomId);
  const existing = generations.get(generation.keyId);
  if (existing) {
    return existing.epoch === generation.epoch && sameBytes(existing.key, generation.key);
  }
  for (const other of generations.values()) {
    if (other.epoch === generation.epoch) {
      console.warn('[e2e] discarded room key generation that conflicts with a known epoch', { roomId, epoch: generation.epoch });
      return false;
    }
  }

  generations.set(generation.keyId, generation);
  missingGenerations.delete(missingKey(roomId, generation.keyId));
  const view = roomViews.get(roomId);
  if (view) {
    view.currentEpoch = Math.max(view.currentEpoch, generation.epoch);
    if (view.rotationRequiredEpoch !== null && generation.epoch >= view.rotationRequiredEpoch) {
      view.rotationRequiredEpoch = null;
    }
  }
  const pending = pendingPublishes.get(roomId);
  if (pending && generation.epoch >= pending.epoch) {
    pendingPublishes.delete(roomId);
  }
  if (persist) {
    void saveRoomKeyGeneration({ roomId, keyId: generation.keyId, epoch: generation.epoch, key: generation.key });
  }
  notifyRoomKeyAvailable(roomId);
  return true;
}

function loadPersistedGenerations(roomId: string): Promise<void> {
  let load = persistedLoads.get(roomId);
  if (!load) {
    load = loadRoomKeyGenerations(roomId).then((stored) => {
      for (const entry of stored) {
        if (entry.key.length === ROOM_KEY_BYTES) {
          adoptGeneration(roomId, { keyId: entry.keyId, epoch: entry.epoch, key: entry.key }, false);
        }
      }
    });
    persistedLoads.set(roomId, load);
  }
  return load;
}

function queueEnvelope(entry: SealedRoomKeyEntry): void {
  const sameRoom = queuedEnvelopes.filter((queued) => queued.roomId === entry.roomId);
  if (sameRoom.length >= MAX_QUEUED_ENVELOPES_PER_ROOM) {
    const oldest = sameRoom[0];
    queuedEnvelopes = queuedEnvelopes.filter((queued) => queued !== oldest);
  }
  if (queuedEnvelopes.length >= MAX_QUEUED_ENVELOPES) {
    queuedEnvelopes = queuedEnvelopes.slice(queuedEnvelopes.length - MAX_QUEUED_ENVELOPES + 1);
  }
  queuedEnvelopes.push(entry);
}

function takeQueuedEnvelopes(roomId: string): SealedRoomKeyEntry[] {
  const taken = queuedEnvelopes.filter((queued) => queued.roomId === roomId);
  if (taken.length > 0) {
    queuedEnvelopes = queuedEnvelopes.filter((queued) => queued.roomId !== roomId);
  }
  return taken;
}

function isEnvelopeSenderAllowed(roomId: string, view: RoomView, userId: string, epoch: number): boolean {
  const highestKnownEpoch = Math.max(view.currentEpoch, latestGeneration(roomId)?.epoch ?? 0);
  return epoch < highestKnownEpoch || view.members.has(userId);
}

function isServerManaged(view: RoomView, userId: string): boolean {
  return view.type === 'private' && userId === ASSISTANT_USER_ID;
}

async function acceptEnvelope(socket: AppSocket, entry: SealedRoomKeyEntry): Promise<boolean> {
  const identity = getCurrentIdentity();
  if (!identity) {
    return false;
  }
  const view = roomViews.get(entry.roomId);
  if (!view) {
    queueEnvelope(entry);
    return false;
  }
  if (generationsByRoom.get(entry.roomId)?.has(entry.keyId)) {
    return true;
  }

  try {
    const opened = await openRoomKeyEnvelope(entry.sealedKey, {
      roomId: entry.roomId,
      recipientId: identity.userId,
      recipientPublicKey: identity.publicKey,
      recipientPrivateKey: identity.privateKey,
      isMember: (userId, epoch) => isEnvelopeSenderAllowed(entry.roomId, view, userId, epoch),
      resolveSender: (userId) => resolveEnvelopeSender(socket, identity, userId),
    });
    if (opened.keyId !== entry.keyId || opened.epoch !== entry.epoch || opened.senderId !== entry.senderId) {
      throw new RoomKeyEnvelopeError('malformed');
    }
    if (getCurrentIdentity() !== identity) {
      return false;
    }
    return adoptGeneration(entry.roomId, { keyId: opened.keyId, epoch: opened.epoch, key: opened.roomKey }, true);
  } catch (error) {
    if (error instanceof RoomKeyEnvelopeError) {
      console.warn('[e2e] discarded room key envelope', { roomId: entry.roomId, senderId: entry.senderId, reason: error.reason });
      return false;
    }
    throw error;
  }
}

async function acceptEnvelopes(socket: AppSocket, entries: SealedRoomKeyEntry[]): Promise<void> {
  const ordered = [...entries].sort((left, right) => left.epoch - right.epoch);
  for (const entry of ordered) {
    await acceptEnvelope(socket, entry);
  }
}

function syncRoomKeys(socket: AppSocket, roomId: string): Promise<void> {
  let sync = pendingSyncs.get(roomId);
  if (!sync) {
    sync = (async () => {
      const bundle = await lookupRoomKeyBundle(socket, roomId);
      if (bundle) {
        await acceptEnvelopes(socket, bundle.keys);
      }
    })().finally(() => {
      pendingSyncs.delete(roomId);
    });
    pendingSyncs.set(roomId, sync);
  }
  return sync;
}

export function getRoomKeyGeneration(roomId: string, keyId: string): Uint8Array | null {
  return generationsByRoom.get(roomId)?.get(keyId)?.key ?? null;
}

export async function ensureRoomKeyGeneration(socket: AppSocket, roomId: string, keyId: string): Promise<Uint8Array | null> {
  const cached = getRoomKeyGeneration(roomId, keyId);
  if (cached) {
    return cached;
  }
  await loadPersistedGenerations(roomId);
  const persisted = getRoomKeyGeneration(roomId, keyId);
  if (persisted) {
    return persisted;
  }
  const marker = missingKey(roomId, keyId);
  const missingSince = missingGenerations.get(marker);
  if (missingSince !== undefined && Date.now() - missingSince < MISSING_GENERATION_RETRY_MS) {
    return null;
  }
  await syncRoomKeys(socket, roomId);
  const fetched = getRoomKeyGeneration(roomId, keyId);
  if (!fetched) {
    missingGenerations.set(marker, Date.now());
  }
  return fetched;
}

export async function ensureAnyRoomKey(socket: AppSocket, roomId: string): Promise<boolean> {
  await loadPersistedGenerations(roomId);
  if (!latestGeneration(roomId)) {
    await syncRoomKeys(socket, roomId);
  }
  return latestGeneration(roomId) !== null;
}

function sendableGeneration(roomId: string): RoomKeyGeneration | null {
  const latest = latestGeneration(roomId);
  if (!latest) {
    return null;
  }
  const view = roomViews.get(roomId);
  if (view && (view.currentEpoch > latest.epoch || (view.rotationRequiredEpoch ?? 0) > latest.epoch)) {
    return null;
  }
  return latest;
}

export function getCurrentRoomKey(roomId: string): RoomKeyGeneration | null {
  return sendableGeneration(roomId);
}

export class MissingRoomKeyError extends Error {
  constructor() {
    super(translate('errors.e2ee.missingRoomKey'));
    this.name = 'MissingRoomKeyError';
  }
}

export function requireCurrentRoomKey(roomId: string): RoomKeyGeneration {
  const generation = sendableGeneration(roomId);
  if (!generation) {
    throw new MissingRoomKeyError();
  }
  return generation;
}

function publishTarget(roomId: string): number | null {
  const view = roomViews.get(roomId);
  if (!view) {
    return null;
  }
  const latestEpoch = latestGeneration(roomId)?.epoch ?? 0;
  if (view.rotationRequiredEpoch !== null && view.rotationRequiredEpoch > latestEpoch) {
    return view.rotationRequiredEpoch;
  }
  if (view.currentEpoch === 0 && latestEpoch === 0) {
    return 1;
  }
  return null;
}

function isPublishInFlight(roomId: string, epoch: number): boolean {
  const pending = pendingPublishes.get(roomId);
  return Boolean(pending && pending.epoch === epoch && Date.now() - pending.startedAt < REQUEST_TIMEOUT_MS);
}

async function sealFor(
  socket: AppSocket,
  identity: CurrentIdentity,
  view: RoomView,
  roomId: string,
  generation: RoomKeyGeneration,
  recipientIds: string[],
): Promise<{ userId: string; sealedKey: string }[] | null> {
  const publicKeys = await Promise.all(
    recipientIds.map((userId) =>
      userId === identity.userId
        ? Promise.resolve(identity.publicKey)
        : lookupUsableContactKey(socket, userId, isServerManaged(view, userId)),
    ),
  );
  if (publicKeys.some((publicKey) => publicKey === null)) {
    return null;
  }

  const signing = await deriveSigningKeyPair(identity.privateKey);
  try {
    return await Promise.all(
      recipientIds.map(async (userId, index) => ({
        userId,
        sealedKey: await sealRoomKeyEnvelope({
          roomKey: generation.key,
          roomId,
          keyId: generation.keyId,
          epoch: generation.epoch,
          senderId: identity.userId,
          senderPrivateKey: identity.privateKey,
          senderSigningPrivateKey: signing.privateKey,
          recipientId: userId,
          recipientPublicKey: publicKeys[index] as string,
        }),
      })),
    );
  } finally {
    signing.privateKey.fill(0);
  }
}

async function publishGeneration(socket: AppSocket, roomId: string, epoch: number): Promise<void> {
  const identity = getCurrentIdentity();
  const view = roomViews.get(roomId);
  if (!identity || !view?.members.has(identity.userId) || isPublishInFlight(roomId, epoch)) {
    return;
  }
  pendingPublishes.set(roomId, { epoch, startedAt: Date.now() });

  const sodium = await getSodium();
  const key = sodium.randombytes_buf(ROOM_KEY_BYTES);
  const generation: RoomKeyGeneration = { keyId: await deriveRoomKeyId(key), epoch, key };
  const recipients = Array.from(view.members);
  if (recipients.length > MAX_ROOM_KEY_BATCH) {
    console.warn('[e2e] room has more members than a room key batch can hold', { roomId, epoch });
    pendingPublishes.delete(roomId);
    return;
  }
  try {
    const keys = await sealFor(socket, identity, view, roomId, generation, recipients);
    if (!keys) {
      console.warn('[e2e] cannot seal a new room key generation for every member', { roomId, epoch });
      pendingPublishes.delete(roomId);
      return;
    }
    if (publishTarget(roomId) !== epoch || getCurrentIdentity() !== identity) {
      pendingPublishes.delete(roomId);
      return;
    }
    socket.emit('e2e:publish-room-key', { roomId, keyId: generation.keyId, epoch, keys });
  } finally {
    generation.key.fill(0);
  }
}

function waitForSendable(roomId: string, timeoutMs: number): Promise<RoomKeyGeneration | null> {
  const ready = sendableGeneration(roomId);
  if (ready) {
    return Promise.resolve(ready);
  }
  return new Promise((resolve) => {
    let timeoutId = 0;
    const unsubscribe = subscribeRoomKeyAvailable((availableRoomId) => {
      if (availableRoomId !== roomId) {
        return;
      }
      const generation = sendableGeneration(roomId);
      if (generation) {
        window.clearTimeout(timeoutId);
        unsubscribe();
        resolve(generation);
      }
    });
    timeoutId = window.setTimeout(() => {
      unsubscribe();
      resolve(sendableGeneration(roomId));
    }, timeoutMs);
  });
}

export async function ensureRoomKeyForSending(socket: AppSocket, roomId: string): Promise<RoomKeyGeneration> {
  await loadPersistedGenerations(roomId);
  let generation = sendableGeneration(roomId);
  if (generation) {
    return generation;
  }

  await syncRoomKeys(socket, roomId);
  generation = sendableGeneration(roomId);
  if (generation) {
    return generation;
  }

  const target = publishTarget(roomId);
  if (target !== null) {
    await publishGeneration(socket, roomId, target);
  } else if (roomViews.has(roomId)) {
    socket.emit('e2e:request-room-key', { roomId });
  }

  generation = await waitForSendable(roomId, REQUEST_TIMEOUT_MS);
  if (!generation) {
    throw new MissingRoomKeyError();
  }
  return generation;
}

function viewFor(roomId: string): RoomView {
  let view = roomViews.get(roomId);
  if (!view) {
    view = {
      type: null,
      creatorId: null,
      members: new Set(),
      currentEpoch: 0,
      rotationRequiredEpoch: null,
    };
    roomViews.set(roomId, view);
  }
  return view;
}

function applyParticipants(view: RoomView, participants: Pick<RoomParticipant, 'id'>[]): string[] {
  const added = participants.filter((participant) => !view.members.has(participant.id)).map((participant) => participant.id);
  view.members = new Set(participants.map((participant) => participant.id));
  return added;
}

function applyRotationRequired(view: RoomView, roomId: string, epoch: number | null | undefined): void {
  const latestEpoch = latestGeneration(roomId)?.epoch ?? 0;
  if (typeof epoch === 'number' && epoch > latestEpoch && epoch > (view.rotationRequiredEpoch ?? 0)) {
    view.rotationRequiredEpoch = epoch;
  }
}

async function shareCurrentGeneration(socket: AppSocket, roomId: string, targetIds: string[]): Promise<void> {
  const identity = getCurrentIdentity();
  const view = roomViews.get(roomId);
  if (!identity || !view?.members.has(identity.userId)) {
    return;
  }
  const recipients = targetIds.filter((userId) => userId !== identity.userId && view.members.has(userId));
  if (recipients.length === 0) {
    return;
  }
  await loadPersistedGenerations(roomId);
  const generation = sendableGeneration(roomId);
  if (!generation) {
    return;
  }
  for (let start = 0; start < recipients.length; start += MAX_ROOM_KEY_BATCH) {
    const keys = await sealFor(socket, identity, view, roomId, generation, recipients.slice(start, start + MAX_ROOM_KEY_BATCH));
    if (keys) {
      socket.emit('e2e:share-room-key', { roomId, keyId: generation.keyId, epoch: generation.epoch, keys });
    }
  }
}

export interface TrackRoomOptions {
  activeCreation?: boolean;
}

async function trackRoomImpl(socket: AppSocket, room: RoomSummary, options: TrackRoomOptions = {}): Promise<void> {
  const view = viewFor(room.id);
  applyParticipants(view, room.participants);
  view.type = room.type;
  view.creatorId = room.creatorId ?? null;
  view.currentEpoch = Math.max(view.currentEpoch, room.currentEpoch ?? 0);
  applyRotationRequired(view, room.id, room.rotationRequiredEpoch);

  const identity = getCurrentIdentity();
  if (!identity || !view.members.has(identity.userId)) {
    return;
  }

  const queued = takeQueuedEnvelopes(room.id);
  if (queued.length > 0) {
    await acceptEnvelopes(socket, queued);
  }

  await loadPersistedGenerations(room.id);
  if (!sendableGeneration(room.id) && view.currentEpoch > (latestGeneration(room.id)?.epoch ?? 0)) {
    await syncRoomKeys(socket, room.id);
  }

  const target = publishTarget(room.id);
  if (target !== null && target > 1) {
    await publishGeneration(socket, room.id, target);
    return;
  }
  if (target === 1) {
    const designated = room.type === 'private' ? options.activeCreation === true : room.creatorId === identity.userId;
    if (designated) {
      await publishGeneration(socket, room.id, 1);
    }
    return;
  }
  if (!sendableGeneration(room.id) && view.currentEpoch > 0) {
    socket.emit('e2e:request-room-key', { roomId: room.id });
  }
}

async function handleRoomKeyPushImpl(socket: AppSocket, entry: SealedRoomKeyEntry): Promise<void> {
  await acceptEnvelope(socket, entry);
}

export interface RoomKeyRejection {
  roomId: string;
  epoch?: number;
  code?: string;
  currentEpoch?: number;
  currentKeyId?: string | null;
  rotationRequiredEpoch?: number | null;
}

const INCOMPLETE_BATCH_CODE = 'e2e.roomKeyIncomplete';

async function handleRoomKeyRejectedImpl(socket: AppSocket, payload: RoomKeyRejection): Promise<void> {
  const pending = pendingPublishes.get(payload.roomId);
  if (pending && (payload.epoch === undefined || pending.epoch === payload.epoch)) {
    pendingPublishes.delete(payload.roomId);
  }
  const view = roomViews.get(payload.roomId);
  if (view && typeof payload.currentEpoch === 'number') {
    view.currentEpoch = Math.max(view.currentEpoch, payload.currentEpoch);
  }
  if (view) {
    applyRotationRequired(view, payload.roomId, payload.rotationRequiredEpoch);
  }
  await syncRoomKeys(socket, payload.roomId);

  const target = publishTarget(payload.roomId);
  if (target !== null && target > 1 && target !== payload.epoch && payload.code !== INCOMPLETE_BATCH_CODE) {
    await publishGeneration(socket, payload.roomId, target);
  }
}

async function handleStaleRoomKeyImpl(socket: AppSocket, roomId: string, staleKeyId: string): Promise<void> {
  missingGenerations.clear();
  await syncRoomKeys(socket, roomId);
  const view = roomViews.get(roomId);
  const latest = latestGeneration(roomId);
  if (view && latest && latest.keyId === staleKeyId) {
    applyRotationRequired(view, roomId, latest.epoch + 1);
  }
}

export async function recoverFromStaleRoomKey(socket: AppSocket, roomId: string, staleKeyId: string): Promise<RoomKeyGeneration> {
  await handleStaleRoomKeyImpl(socket, roomId, staleKeyId);
  return ensureRoomKeyForSending(socket, roomId);
}

async function handleRotationRequiredImpl(
  socket: AppSocket,
  payload: { roomId: string; epoch: number; memberIds?: string[] },
): Promise<void> {
  const view = roomViews.get(payload.roomId);
  if (!view) {
    return;
  }
  if (Array.isArray(payload.memberIds)) {
    const remaining = new Set(payload.memberIds);
    view.members = new Set(Array.from(view.members).filter((userId) => remaining.has(userId)));
  }
  applyRotationRequired(view, payload.roomId, payload.epoch);
  const target = publishTarget(payload.roomId);
  if (target !== null && target === view.rotationRequiredEpoch) {
    await publishGeneration(socket, payload.roomId, target);
  }
}

async function handleGroupUserJoinedImpl(socket: AppSocket, payload: { roomId: string; participants: RoomParticipant[] }): Promise<void> {
  const view = roomViews.get(payload.roomId);
  if (!view) {
    return;
  }
  const added = applyParticipants(view, payload.participants);
  await shareCurrentGeneration(socket, payload.roomId, added);
}

export function updateRoomParticipants(roomId: string, participants: RoomParticipant[]): void {
  const view = roomViews.get(roomId);
  if (view) {
    applyParticipants(view, participants);
  }
}

async function handleKeyRequestImpl(socket: AppSocket, payload: { roomId: string; requesterId: string }): Promise<void> {
  await shareCurrentGeneration(socket, payload.roomId, [payload.requesterId]);
}

async function clearRoomKeysImpl(): Promise<void> {
  for (const generations of generationsByRoom.values()) {
    for (const generation of generations.values()) {
      generation.key.fill(0);
    }
  }
  generationsByRoom.clear();
  roomViews.clear();
  persistedLoads.clear();
  pendingSyncs.clear();
  missingGenerations.clear();
  pendingPublishes.clear();
  queuedEnvelopes = [];
  clearDecryptedMediaCache();
  await clearRoomKeyStore();
}

export const trackRoom = safeAsync('trackRoom', trackRoomImpl);
export const handleRoomKeyPush = safeAsync('handleRoomKeyPush', handleRoomKeyPushImpl);
export const handleRoomKeyRejected = safeAsync('handleRoomKeyRejected', handleRoomKeyRejectedImpl);
export const handleRotationRequired = safeAsync('handleRotationRequired', handleRotationRequiredImpl);
export const handleGroupUserJoined = safeAsync('handleGroupUserJoined', handleGroupUserJoinedImpl);
export const handleKeyRequest = safeAsync('handleKeyRequest', handleKeyRequestImpl);
export const clearRoomKeys = safeAsync('clearRoomKeys', clearRoomKeysImpl);
