import type { AppSocket, E2ePublicKeyEntry, RoomSummary } from '@lib/socket';
import { createBatchedLookup } from './batched-lookup';
import { getCurrentIdentity } from './current-identity';
import { clearRoomKeyStore, deleteRoomKey, loadRoomKey, saveRoomKey } from './key-store';
import { safeAsync } from './safe-async';
import { getSodium } from './sodium';

interface SealedRoomKeyEntry {
  roomId: string;
  sealedKey: string;
}

const REQUEST_TIMEOUT_MS = 8000;

const memoryCache = new Map<string, Uint8Array>();
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

function cacheRoomKey(roomId: string, key: Uint8Array): void {
  memoryCache.set(roomId, key);
  void saveRoomKey(roomId, key);
}

export function getCachedRoomKey(roomId: string): Uint8Array | null {
  return memoryCache.get(roomId) ?? null;
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
      memoryCache.set(roomId, persisted);
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

// A room key that is present but cannot open the room's messages means the locally stored copy is
// stale or wrong. The authoritative copy lives on the server, sealed to this user's public key, so
// drop the local one and fetch it again. A whole page of messages fails together, so every caller
// shares the single in-flight refetch and then retries with the repaired key; once that refetch has
// happened the room is not fetched again, which keeps a genuinely undecryptable message from
// turning into a refetch loop.
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

  // Only the client that actively triggered the creation (received 'room:joined' as a direct
  // response to its own room:create-private call) is allowed to generate a fresh room key — a
  // private room is only ever "created" once, so this can never race. Any other discovery path
  // (room:new, rooms:list, or a passive 'room:joined' — which does not happen for private rooms)
  // only asks for the key instead, exactly like a group member who wasn't the one who made it.
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

  cacheRoomKey(room.id, roomKey);
  socket.emit('e2e:publish-room-key', {
    roomId: room.id,
    keys: [
      { userId: currentUserId, sealedKey: sealedForSelf },
      { userId: otherParticipant.id, sealedKey: sealedForOther },
    ],
  });
}

async function handleIncomingRoomKeyPushImpl(payload: { roomId: string; sealedKey: string }): Promise<void> {
  const unsealed = await unsealRoomKey(payload.sealedKey);
  if (unsealed) {
    cacheRoomKey(payload.roomId, unsealed);
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

  cacheRoomKey(room.id, roomKey);
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
  pendingLookups.clear();
  knownParticipantsByRoom.clear();
  refetchedRoomIds.clear();
  pendingRefetches.clear();
  await clearRoomKeyStore();
}

export const establishPrivateRoomKey = safeAsync('establishPrivateRoomKey', establishPrivateRoomKeyImpl);
export const handleIncomingRoomKeyPush = safeAsync('handleIncomingRoomKeyPush', handleIncomingRoomKeyPushImpl);
export const establishGroupRoomKeyOnCreate = safeAsync('establishGroupRoomKeyOnCreate', establishGroupRoomKeyOnCreateImpl);
export const requestGroupRoomKeyIfMissing = safeAsync('requestGroupRoomKeyIfMissing', requestGroupRoomKeyIfMissingImpl);
export const handleGroupUserJoined = safeAsync('handleGroupUserJoined', handleGroupUserJoinedImpl);
export const handleKeyRequest = safeAsync('handleKeyRequest', handleKeyRequestImpl);
export const clearRoomKeys = safeAsync('clearRoomKeys', clearRoomKeysImpl);
