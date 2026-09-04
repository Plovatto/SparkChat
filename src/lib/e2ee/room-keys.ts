import type { AppSocket, E2ePublicKeyEntry, RoomSummary } from '@lib/socket';
import { getCurrentIdentity } from './current-identity';
import { clearRoomKeyStore, loadRoomKey, saveRoomKey } from './key-store';
import { safeAsync } from './safe-async';
import { getSodium } from './sodium';

const REQUEST_TIMEOUT_MS = 8000;

const memoryCache = new Map<string, Uint8Array>();
const pendingLookups = new Map<string, Promise<Uint8Array | null>>();
const knownParticipantsByRoom = new Map<string, Set<string>>();

function requestRoomKeys(socket: AppSocket, roomIds: string[]): Promise<{ roomId: string; sealedKey: string }[]> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: { roomId: string; sealedKey: string }[]) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.off('e2e:room-keys', handleKeys);
      resolve(value);
    };

    const handleKeys = (payload: { keys: { roomId: string; sealedKey: string }[] }) => finish(payload.keys);

    socket.on('e2e:room-keys', handleKeys);
    socket.emit('e2e:get-room-keys', { roomIds });
    setTimeout(() => finish([]), REQUEST_TIMEOUT_MS);
  });
}

function requestPublicKeys(socket: AppSocket, userIds: string[]): Promise<E2ePublicKeyEntry[]> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: E2ePublicKeyEntry[]) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.off('e2e:public-keys', handleKeys);
      resolve(value);
    };

    const handleKeys = (payload: { keys: E2ePublicKeyEntry[] }) => finish(payload.keys);

    socket.on('e2e:public-keys', handleKeys);
    socket.emit('e2e:get-public-keys', { userIds });
    setTimeout(() => finish([]), REQUEST_TIMEOUT_MS);
  });
}

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

    const [entry] = await requestRoomKeys(socket, [roomId]);
    if (!entry) {
      return null;
    }

    const unsealed = await unsealRoomKey(entry.sealedKey);
    if (!unsealed) {
      return null;
    }

    cacheRoomKey(roomId, unsealed);
    return unsealed;
  })();

  pendingLookups.set(roomId, lookup);
  try {
    return await lookup;
  } finally {
    pendingLookups.delete(roomId);
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

  const [publicKeys] = await Promise.all([requestPublicKeys(socket, [otherParticipant.id])]);
  const otherPublicKey = publicKeys.find((entry) => entry.userId === otherParticipant.id)?.publicKey;
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

  const publicKeys = await requestPublicKeys(socket, [targetUserId]);
  const targetPublicKey = publicKeys.find((entry) => entry.userId === targetUserId)?.publicKey;
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
  await clearRoomKeyStore();
}

export const establishPrivateRoomKey = safeAsync('establishPrivateRoomKey', establishPrivateRoomKeyImpl);
export const handleIncomingRoomKeyPush = safeAsync('handleIncomingRoomKeyPush', handleIncomingRoomKeyPushImpl);
export const establishGroupRoomKeyOnCreate = safeAsync('establishGroupRoomKeyOnCreate', establishGroupRoomKeyOnCreateImpl);
export const requestGroupRoomKeyIfMissing = safeAsync('requestGroupRoomKeyIfMissing', requestGroupRoomKeyIfMissingImpl);
export const handleGroupUserJoined = safeAsync('handleGroupUserJoined', handleGroupUserJoinedImpl);
export const handleKeyRequest = safeAsync('handleKeyRequest', handleKeyRequestImpl);
export const clearRoomKeys = safeAsync('clearRoomKeys', clearRoomKeysImpl);
