import { translate } from '@lib/i18n/app-i18n';
import type { AppSocket, E2ePublicKeyEntry, RoomSummary } from '@lib/socket';
import { createBatchedLookup } from './batched-lookup';
import { getCurrentIdentity } from './current-identity';
import { clearRoomKeyStore, deleteRoomKey, loadRoomKey, saveRoomKey } from './key-store';
import { clearDecryptedMediaCache } from './media-cache';
import { safeAsync } from './safe-async';
import { getSodium } from './sodium';

interface SealedRoomKeyEntry {
  roomId: string;
  sealedKey: string;
}

const REQUEST_TIMEOUT_MS = 8000;

const PROVISIONAL_KEY_WINDOW_MS = 15000;

const memoryCache = new Map<string, Uint8Array>();
const provisionalUntil = new Map<string, number>();
const pendingLookups = new Map<string, Promise<Uint8Array | null>>();
const knownParticipantsByRoom = new Map<string, Set<string>>();
const refetchedRoomIds = new Set<string>();
const pendingRefetches = new Map<string, Promise<Uint8Array | null>>();

function fetchRoomKeys(socket: AppSocket, roomIds: string[]): Promise<SealedRoomKeyEntry[]> {
  return new Promise((resolve) => {
    const requested = new Set(roomIds);
    let settled = false;
    let timeoutId = 0;

    const finish = (value: SealedRoomKeyEntry[]) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      socket.off('e2e:room-keys', handleKeys);
      resolve(value);
    };

    const handleKeys = (payload: { keys: SealedRoomKeyEntry[] }) => {
      finish(payload.keys.filter((entry) => requested.has(entry.roomId)));
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

const lookupSealedRoomKey = createBatchedLookup(fetchRoomKeys, (entry) => entry.roomId);
const lookupPublicKey = createBatchedLookup(fetchPublicKeys, (entry) => entry.userId);

async function unsealRoomKey(sealedKeyBase64: string): Promise<Uint8Array | null> {
  const identity = getCurrentIdentity();
  if (!identity) {
    return null;
  }

  try {
    const sodium = await getSodium();
    const sealed = sodium.from_base64(sealedKeyBase64);
    const publicKey = sodium.from_base64(identity.publicKey);
    return sodium.crypto_box_seal_open(sealed, publicKey, identity.privateKey);
  } catch {
    return null;
  }
}

async function sealRoomKeyFor(roomKey: Uint8Array, publicKeyBase64: string): Promise<string> {
  const sodium = await getSodium();
  const publicKey = sodium.from_base64(publicKeyBase64);
  const sealed = sodium.crypto_box_seal(roomKey, publicKey);
  return sodium.to_base64(sealed);
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

function setMemoryRoomKey(roomId: string, key: Uint8Array): void {
  const previous = memoryCache.get(roomId);
  memoryCache.set(roomId, key);
  if (previous !== key) {
    notifyRoomKeyAvailable(roomId);
  }
}

function cacheRoomKey(roomId: string, key: Uint8Array): void {
  setMemoryRoomKey(roomId, key);
  void saveRoomKey(roomId, key);
}

function cacheProvisionalRoomKey(roomId: string, key: Uint8Array): void {
  provisionalUntil.set(roomId, Date.now() + PROVISIONAL_KEY_WINDOW_MS);
  cacheRoomKey(roomId, key);
}

function isProvisional(roomId: string): boolean {
  const until = provisionalUntil.get(roomId);
  if (until === undefined) {
    return false;
  }
  if (until > Date.now()) {
    return true;
  }
  provisionalUntil.delete(roomId);
  return false;
}

export function getCachedRoomKey(roomId: string): Uint8Array | null {
  return memoryCache.get(roomId) ?? null;
}

export class MissingRoomKeyError extends Error {
  constructor() {
    super(translate('errors.e2ee.missingRoomKey'));
    this.name = 'MissingRoomKeyError';
  }
}

export function requireCachedRoomKey(roomId: string): Uint8Array {
  const roomKey = memoryCache.get(roomId);
  if (!roomKey) {
    throw new MissingRoomKeyError();
  }
  return roomKey;
}

export async function ensureRoomKeyForDecryption(socket: AppSocket, roomId: string): Promise<Uint8Array | null> {
  const cached = memoryCache.get(roomId);
  if (cached) {
    return cached;
  }

  const pending = pendingLookups.get(roomId);
  if (pending) {
    return pending;
  }

  const lookup = (async () => {
    const persisted = await loadRoomKey(roomId);
    if (persisted) {
      const current = memoryCache.get(roomId);
      if (current) {
        return current;
      }
      setMemoryRoomKey(roomId, persisted);
      return persisted;
    }

    const entry = await lookupSealedRoomKey(socket, roomId);
    if (!entry) {
      return null;
    }

    const unsealed = await unsealRoomKey(entry.sealedKey);
    if (!unsealed) {
      return null;
    }

    const current = memoryCache.get(roomId);
    if (current) {
      return current;
    }

    cacheRoomKey(entry.roomId, unsealed);
    return unsealed;
  })();

  pendingLookups.set(roomId, lookup);
  try {
    return await lookup;
  } finally {
    pendingLookups.delete(roomId);
  }
}

export async function refetchRoomKeyAfterDecryptionFailure(socket: AppSocket, roomId: string): Promise<Uint8Array | null> {
  const inFlight = pendingRefetches.get(roomId);
  if (inFlight) {
    return inFlight;
  }

  if (refetchedRoomIds.has(roomId)) {
    return memoryCache.get(roomId) ?? null;
  }
  refetchedRoomIds.add(roomId);

  const refetch = (async () => {
    memoryCache.delete(roomId);
    pendingLookups.delete(roomId);
    await deleteRoomKey(roomId);
    return ensureRoomKeyForDecryption(socket, roomId);
  })();

  pendingRefetches.set(roomId, refetch);
  try {
    return await refetch;
  } finally {
    pendingRefetches.delete(roomId);
  }
}

async function establishPrivateRoomKeyImpl(
  socket: AppSocket,
  room: RoomSummary,
  currentUserId: string,
  isActiveCreationEvent: boolean,
): Promise<void> {
  if (room.type !== 'private') {
    return;
  }

  const identity = getCurrentIdentity();
  if (!identity) {
    return;
  }

  const existing = await ensureRoomKeyForDecryption(socket, room.id);
  if (existing) {
    return;
  }

  const otherParticipant = room.participants.find((participant) => participant.id !== currentUserId);
  if (!otherParticipant) {
    return;
  }

  if (!isActiveCreationEvent) {
    socket.emit('e2e:request-room-key', { roomId: room.id });
    return;
  }

  const otherPublicKey = (await lookupPublicKey(socket, otherParticipant.id))?.publicKey;
  if (!otherPublicKey) {
    return;
  }

  const sodium = await getSodium();
  const roomKey = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);

  const [sealedForSelf, sealedForOther] = await Promise.all([
    sealRoomKeyFor(roomKey, identity.publicKey),
    sealRoomKeyFor(roomKey, otherPublicKey),
  ]);

  if (memoryCache.has(room.id)) {
    return;
  }

  cacheProvisionalRoomKey(room.id, roomKey);
  socket.emit('e2e:publish-room-key', {
    roomId: room.id,
    keys: [
      { userId: currentUserId, sealedKey: sealedForSelf },
      { userId: otherParticipant.id, sealedKey: sealedForOther },
    ],
  });
}

async function handleIncomingRoomKeyPushImpl(payload: { roomId: string; sealedKey: string }): Promise<void> {
  if (!getCurrentIdentity()) {
    return;
  }

  if (isProvisional(payload.roomId)) {
    const unsealed = await unsealRoomKey(payload.sealedKey);
    if (unsealed) {
      provisionalUntil.delete(payload.roomId);
      cacheRoomKey(payload.roomId, unsealed);
    }
    return;
  }

  if (memoryCache.has(payload.roomId)) {
    return;
  }

  const persisted = await loadRoomKey(payload.roomId);
  if (persisted) {
    if (!memoryCache.has(payload.roomId)) {
      setMemoryRoomKey(payload.roomId, persisted);
    }
    return;
  }

  const unsealed = await unsealRoomKey(payload.sealedKey);
  if (unsealed && !memoryCache.has(payload.roomId)) {
    cacheRoomKey(payload.roomId, unsealed);
  }
}

async function handleRoomKeyRejectedImpl(socket: AppSocket, payload: { roomId: string }): Promise<void> {
  provisionalUntil.delete(payload.roomId);
  memoryCache.delete(payload.roomId);
  pendingLookups.delete(payload.roomId);
  await deleteRoomKey(payload.roomId);

  const stored = await ensureRoomKeyForDecryption(socket, payload.roomId);
  if (!stored) {
    socket.emit('e2e:request-room-key', { roomId: payload.roomId });
  }
}

export function trackRoomParticipants(room: RoomSummary): void {
  knownParticipantsByRoom.set(room.id, new Set(room.participants.map((participant) => participant.id)));
}

async function establishGroupRoomKeyOnCreateImpl(socket: AppSocket, room: RoomSummary, currentUserId: string): Promise<void> {
  if (room.type !== 'group' || room.creatorId !== currentUserId) {
    return;
  }

  const identity = getCurrentIdentity();
  if (!identity) {
    return;
  }

  const existing = await ensureRoomKeyForDecryption(socket, room.id);
  if (existing) {
    return;
  }

  const sodium = await getSodium();
  const roomKey = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
  const sealedForSelf = await sealRoomKeyFor(roomKey, identity.publicKey);

  if (memoryCache.has(room.id)) {
    return;
  }

  cacheProvisionalRoomKey(room.id, roomKey);
  socket.emit('e2e:publish-room-key', {
    roomId: room.id,
    keys: [{ userId: currentUserId, sealedKey: sealedForSelf }],
  });
}

async function requestGroupRoomKeyIfMissingImpl(socket: AppSocket, room: RoomSummary, currentUserId: string): Promise<void> {
  if (room.type !== 'group' || room.creatorId === currentUserId) {
    return;
  }

  const existing = await ensureRoomKeyForDecryption(socket, room.id);
  if (existing) {
    return;
  }

  socket.emit('e2e:request-room-key', { roomId: room.id });
}

async function sealAndPublishForParticipant(socket: AppSocket, roomId: string, targetUserId: string): Promise<void> {
  const roomKey = await ensureRoomKeyForDecryption(socket, roomId);
  if (!roomKey) {
    return;
  }

  const targetPublicKey = (await lookupPublicKey(socket, targetUserId))?.publicKey;
  if (!targetPublicKey) {
    return;
  }

  const sealedKey = await sealRoomKeyFor(roomKey, targetPublicKey);
  socket.emit('e2e:publish-room-key', { roomId, keys: [{ userId: targetUserId, sealedKey }] });
}

async function handleGroupUserJoinedImpl(
  socket: AppSocket,
  payload: { roomId: string; participants: { id: string }[] },
): Promise<void> {
  const previous = knownParticipantsByRoom.get(payload.roomId);
  const currentIds = payload.participants.map((participant) => participant.id);
  knownParticipantsByRoom.set(payload.roomId, new Set(currentIds));

  if (!previous) {
    return;
  }

  const newParticipantIds = currentIds.filter((id) => !previous.has(id));
  await Promise.all(newParticipantIds.map((userId) => sealAndPublishForParticipant(socket, payload.roomId, userId)));
}

async function handleKeyRequestImpl(socket: AppSocket, payload: { roomId: string; requesterId: string }): Promise<void> {
  await sealAndPublishForParticipant(socket, payload.roomId, payload.requesterId);
}

async function clearRoomKeysImpl(): Promise<void> {
  memoryCache.clear();
  provisionalUntil.clear();
  pendingLookups.clear();
  knownParticipantsByRoom.clear();
  refetchedRoomIds.clear();
  pendingRefetches.clear();
  clearDecryptedMediaCache();
  await clearRoomKeyStore();
}

export const establishPrivateRoomKey = safeAsync('establishPrivateRoomKey', establishPrivateRoomKeyImpl);
export const handleIncomingRoomKeyPush = safeAsync('handleIncomingRoomKeyPush', handleIncomingRoomKeyPushImpl);
export const handleRoomKeyRejected = safeAsync('handleRoomKeyRejected', handleRoomKeyRejectedImpl);
export const establishGroupRoomKeyOnCreate = safeAsync('establishGroupRoomKeyOnCreate', establishGroupRoomKeyOnCreateImpl);
export const requestGroupRoomKeyIfMissing = safeAsync('requestGroupRoomKeyIfMissing', requestGroupRoomKeyIfMissingImpl);
export const handleGroupUserJoined = safeAsync('handleGroupUserJoined', handleGroupUserJoinedImpl);
export const handleKeyRequest = safeAsync('handleKeyRequest', handleKeyRequestImpl);
export const clearRoomKeys = safeAsync('clearRoomKeys', clearRoomKeysImpl);
