import { ApiError, type ApiErrorParams } from '@lib/api/api-error';
import { hasTranslation } from '@lib/i18n/app-i18n';
import { isAvatarStorageUrl } from '@lib/media/media-origin';
import type {
  AppSocket,
  BlockStatusPayload,
  ProfileKeyEnvelopeSummary,
  RoomEncryptedAvatar,
  RoomParticipant,
  RoomSummary,
  RoomType,
  SocketErrorPayload,
  SocketUser,
} from '@lib/socket';
import { ASSISTANT_USER_ID } from './assistant';
import { openAvatarFile, type AvatarBinding } from './attachment-crypto';
import { getCurrentIdentity, subscribeCurrentIdentity, type CurrentIdentity } from './current-identity';
import {
  createProfileKeyEnvelope,
  deriveProfileKey,
  isValidProfileKeyVersion,
  openProfileKeyEnvelope,
  openRoomPhotoPointer,
  openUserPhotoPointer,
  sealRoomPhotoPointer,
  sealUserPhotoPointer,
  unwrapProfileKeyEnvelope,
  verifySignedProfileGrant,
  wrapSignedProfileGrant,
  type PhotoPointer,
  type UserPhotoPointer,
} from './profile-photo-crypto';
import {
  canRenameGroup,
  ensureRoomKeyForSending,
  ensureRoomKeyGeneration,
  getCurrentRoomKey,
  getRoomKeyGeneration,
  resolveSigningPublicKey,
  subscribeOwnRotation,
  subscribeRoomKeyAvailable,
  type RoomKeyGeneration,
} from './room-keys';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

export type ProfilePhotoChange = { kind: 'user'; id: string } | { kind: 'room'; id: string } | { kind: 'reset' } | { kind: 'ready' };
export type ProfilePhotoListener = (change: ProfilePhotoChange) => void;

export const PROFILE_PHOTO_FAILED_CODE = 'profilePhoto.failed';
export const PROFILE_PHOTO_UNAVAILABLE_CODE = 'profilePhoto.unavailable';
export const PROFILE_PHOTO_NOT_ALLOWED_CODE = 'profilePhoto.notAllowed';

interface UserRecord {
  encryptedAvatar: string | null;
  version: number;
}

interface RoomRecord {
  type: RoomType;
  participants: Set<string>;
  envelopes: Map<string, ProfileKeyEnvelopeSummary>;
  avatar: RoomEncryptedAvatar | null;
  blockedBy: Record<string, string>;
}

interface Photo {
  cacheKey: string;
  url: string;
}

const MAX_POINTER_LENGTH = 4096;
const MAX_ENVELOPE_LENGTH = 2048;
const MAX_KEY_ID_LENGTH = 64;
const CONFIRM_TIMEOUT_MS = 10000;
const RETRY_FAILED_AFTER_MS = 30000;
const DEFAULT_VERSION = 1;

const users = new Map<string, UserRecord>();
const rooms = new Map<string, RoomRecord>();
const profileKeys = new Map<string, { version: number; key: Uint8Array }>();
const userPhotos = new Map<string, Photo>();
const roomPhotos = new Map<string, Photo>();
const attempted = new Set<string>();
const failedAt = new Map<string, number>();
const resolving = new Map<string, Promise<void>>();
const rerun = new Set<string>();
const interest = new Map<string, number>();
const ownEnvelopeChecks = new Map<string, Promise<void>>();
const ownEnvelopeReruns = new Set<string>();
const verifiedOwnEnvelopes = new Map<string, string>();
const listeners = new Set<ProfilePhotoListener>();
let activeSocket: AppSocket | null = null;
let stateOwnerId: string | null = null;
let stateGeneration = 0;

function userKey(userId: string): string {
  return `user:${userId}`;
}

function roomKey(roomId: string): string {
  return `room:${roomId}`;
}

function notify(change: ProfilePhotoChange): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener(change);
    } catch (error) {
      console.error('[e2e] profile photo listener failed', error);
    }
  }
}

export function subscribeProfilePhotos(listener: ProfilePhotoListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function createProfilePhotoError(code: string | undefined, params?: ApiErrorParams): ApiError {
  const resolved = code && hasTranslation(`errors.${code}`) ? code : PROFILE_PHOTO_FAILED_CODE;
  return new ApiError({ code: resolved, ...(params && resolved === code ? { params } : {}) }, `errors.${PROFILE_PHOTO_FAILED_CODE}`);
}

function currentUserId(): string | null {
  return getCurrentIdentity()?.userId ?? null;
}

function isServerManagedRoom(room: RoomRecord): boolean {
  return room.participants.has(ASSISTANT_USER_ID);
}

function otherParticipant(room: RoomRecord): string | null {
  const me = currentUserId();
  for (const userId of room.participants) {
    if (userId !== me) {
      return userId;
    }
  }
  return null;
}

export function privateRoomsWith(userId: string): string[] {
  const result: string[] = [];
  for (const [roomId, room] of rooms) {
    if (room.type === 'private' && room.participants.has(userId) && otherParticipant(room) === userId) {
      result.push(roomId);
    }
  }
  return result;
}

export function getTrackedRoomIds(): string[] {
  return Array.from(rooms.keys());
}

export function getUserPhotoUrl(userId: string | null | undefined): string | null {
  if (!userId) {
    return null;
  }
  return userPhotos.get(userId)?.url ?? null;
}

export function getRoomPhotoUrl(roomId: string | null | undefined): string | null {
  if (!roomId) {
    return null;
  }
  const room = rooms.get(roomId);
  if (!room) {
    return null;
  }
  if (room.type === 'group') {
    return roomPhotos.get(roomId)?.url ?? null;
  }
  return getUserPhotoUrl(otherParticipant(room));
}

function isInterested(key: string): boolean {
  if ((interest.get(key) ?? 0) > 0) {
    return true;
  }
  if (!key.startsWith('user:')) {
    return false;
  }
  return privateRoomsWith(key.slice('user:'.length)).some((roomId) => (interest.get(roomKey(roomId)) ?? 0) > 0);
}

function setPhoto(kind: 'user' | 'room', id: string, photo: Photo | null): void {
  const store = kind === 'user' ? userPhotos : roomPhotos;
  const previous = store.get(id);
  if (previous?.url === photo?.url) {
    return;
  }
  if (previous) {
    URL.revokeObjectURL(previous.url);
  }
  if (photo) {
    store.set(id, photo);
  } else {
    store.delete(id);
  }
  notify({ kind, id });
}

function scheduleResolve(key: string): void {
  if (resolving.has(key)) {
    rerun.add(key);
    return;
  }
  const task = (async () => {
    do {
      rerun.delete(key);
      await resolveOnce(key);
    } while (rerun.has(key));
  })()
    .catch((error: unknown) => {
      console.error('[e2e] resolving a profile photo failed', error);
    })
    .finally(() => {
      resolving.delete(key);
    });
  resolving.set(key, task);
}

function ensureResolved(key: string): void {
  const failed = failedAt.get(key);
  if (attempted.has(key) && (failed === undefined || Date.now() - failed < RETRY_FAILED_AFTER_MS)) {
    return;
  }
  scheduleResolve(key);
}

function markDirty(key: string): void {
  attempted.delete(key);
  failedAt.delete(key);
  if (isInterested(key)) {
    scheduleResolve(key);
  }
}

function retain(key: string, onRetain: () => void): () => void {
  interest.set(key, (interest.get(key) ?? 0) + 1);
  onRetain();
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const next = (interest.get(key) ?? 1) - 1;
    if (next <= 0) {
      interest.delete(key);
    } else {
      interest.set(key, next);
    }
  };
}

export function retainUserPhoto(userId: string): () => void {
  return retain(userKey(userId), () => ensureResolved(userKey(userId)));
}

export function retainRoomPhoto(roomId: string): () => void {
  return retain(roomKey(roomId), () => {
    const room = rooms.get(roomId);
    if (room) {
      resolveInterestedRoom(roomId, room);
    }
  });
}

async function downloadPhoto(pointer: PhotoPointer, binding: AvatarBinding): Promise<string | null> {
  if (!isAvatarStorageUrl(pointer.url)) {
    return null;
  }
  try {
    const response = await fetch(pointer.url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) {
      return null;
    }
    const blob = await openAvatarFile(await response.arrayBuffer(), pointer.fileKey, binding, pointer.mime);
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

async function ownSigningPublicKey(identity: CurrentIdentity): Promise<string> {
  const sodium = await getSodium();
  const pair = await deriveSigningKeyPair(identity.privateKey);
  pair.privateKey.fill(0);
  return sodium.to_base64(pair.publicKey);
}

async function signingKeyFor(socket: AppSocket, identity: CurrentIdentity, userId: string): Promise<string | null> {
  return userId === identity.userId ? ownSigningPublicKey(identity) : resolveSigningPublicKey(socket, userId);
}

async function profileKeyFor(userId: string, version: number): Promise<Uint8Array | null> {
  const cached = profileKeys.get(userId);
  if (cached?.version === version) {
    return cached.key;
  }
  const socket = activeSocket;
  const identity = getCurrentIdentity();
  if (!socket || !identity) {
    return null;
  }
  let signingPublicKey: string | null | undefined;
  for (const [roomId, room] of Array.from(rooms)) {
    const envelope = room.participants.has(userId) ? room.envelopes.get(userId) : undefined;
    if (!envelope) {
      continue;
    }
    const key = getRoomKeyGeneration(roomId, envelope.keyId) ?? (await ensureRoomKeyGeneration(socket, roomId, envelope.keyId));
    if (!key) {
      continue;
    }
    if (signingPublicKey === undefined) {
      signingPublicKey = await resolveSigningPublicKey(socket, userId);
    }
    if (!signingPublicKey) {
      return null;
    }
    const opened = await openProfileKeyEnvelope(envelope.envelope, {
      roomKey: key,
      roomId,
      keyId: envelope.keyId,
      ownerId: userId,
      expectedVersion: version,
      ownerSigningPublicKey: signingPublicKey,
    });
    if (opened) {
      profileKeys.set(userId, { version, key: opened.profileKey });
      return opened.profileKey;
    }
  }
  return null;
}

function userPhotoCacheKey(userId: string, pointer: UserPhotoPointer): string {
  return ['user', userId, String(pointer.fileVersion), pointer.url, pointer.fileKey].join('\n');
}

function roomPhotoCacheKey(roomId: string, pointer: PhotoPointer): string {
  return ['room', roomId, pointer.url, pointer.fileKey].join('\n');
}

function markFailed(key: string, kind: 'user' | 'room', id: string): void {
  failedAt.set(key, Date.now());
  setPhoto(kind, id, null);
}

async function resolveUser(key: string, userId: string): Promise<void> {
  const generation = stateGeneration;
  const record = users.get(userId);
  const identity = getCurrentIdentity();
  if (!record?.encryptedAvatar || userId === ASSISTANT_USER_ID || !identity) {
    setPhoto('user', userId, null);
    return;
  }
  const isSelf = userId === identity.userId;
  const profileKey = isSelf ? await deriveProfileKey(identity.privateKey, record.version) : await profileKeyFor(userId, record.version);
  if (!profileKey) {
    markFailed(key, 'user', userId);
    return;
  }
  const pointer = await openUserPhotoPointer(record.encryptedAvatar, profileKey, userId, record.version);
  if (isSelf) {
    profileKey.fill(0);
  }
  if (generation !== stateGeneration || users.get(userId) !== record) {
    return;
  }
  if (!pointer) {
    markFailed(key, 'user', userId);
    return;
  }
  const cacheKey = userPhotoCacheKey(userId, pointer);
  if (userPhotos.get(userId)?.cacheKey === cacheKey) {
    return;
  }
  const url = await downloadPhoto(pointer, { kind: 'user', userId, version: pointer.fileVersion });
  if (generation !== stateGeneration || users.get(userId) !== record) {
    if (url) {
      URL.revokeObjectURL(url);
    }
    return;
  }
  if (!url) {
    markFailed(key, 'user', userId);
    return;
  }
  setPhoto('user', userId, { cacheKey, url });
}

async function resolveRoom(key: string, roomId: string): Promise<void> {
  const generation = stateGeneration;
  const room = rooms.get(roomId);
  const avatar = room?.avatar;
  const socket = activeSocket;
  if (!room || room.type !== 'group' || !avatar) {
    setPhoto('room', roomId, null);
    return;
  }
  const roomKeyBytes = getRoomKeyGeneration(roomId, avatar.keyId) ?? (socket ? await ensureRoomKeyGeneration(socket, roomId, avatar.keyId) : null);
  if (!roomKeyBytes) {
    markFailed(key, 'room', roomId);
    return;
  }
  const pointer = await openRoomPhotoPointer(avatar.encryptedAvatar, roomKeyBytes, roomId, avatar.keyId);
  if (generation !== stateGeneration || rooms.get(roomId)?.avatar !== avatar) {
    return;
  }
  if (!pointer) {
    markFailed(key, 'room', roomId);
    return;
  }
  const cacheKey = roomPhotoCacheKey(roomId, pointer);
  if (roomPhotos.get(roomId)?.cacheKey === cacheKey) {
    return;
  }
  const url = await downloadPhoto(pointer, { kind: 'room', roomId });
  if (generation !== stateGeneration || rooms.get(roomId)?.avatar !== avatar) {
    if (url) {
      URL.revokeObjectURL(url);
    }
    return;
  }
  if (!url) {
    markFailed(key, 'room', roomId);
    return;
  }
  setPhoto('room', roomId, { cacheKey, url });
}

async function resolveOnce(key: string): Promise<void> {
  attempted.add(key);
  failedAt.delete(key);
  if (key.startsWith('user:')) {
    await resolveUser(key, key.slice('user:'.length));
  } else {
    await resolveRoom(key, key.slice('room:'.length));
  }
}

function normalizePointer(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_POINTER_LENGTH ? value : null;
}

function normalizeEnvelope(value: unknown): ProfileKeyEnvelopeSummary | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ProfileKeyEnvelopeSummary>;
  if (
    typeof candidate.envelope !== 'string' ||
    candidate.envelope.length === 0 ||
    candidate.envelope.length > MAX_ENVELOPE_LENGTH ||
    typeof candidate.keyId !== 'string' ||
    candidate.keyId.length === 0 ||
    candidate.keyId.length > MAX_KEY_ID_LENGTH
  ) {
    return null;
  }
  return { envelope: candidate.envelope, keyId: candidate.keyId };
}

function normalizeRoomAvatar(value: unknown): RoomEncryptedAvatar | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<RoomEncryptedAvatar>;
  const encryptedAvatar = normalizePointer(candidate.encryptedAvatar);
  if (!encryptedAvatar || typeof candidate.keyId !== 'string' || candidate.keyId.length === 0 || candidate.keyId.length > MAX_KEY_ID_LENGTH) {
    return null;
  }
  return { encryptedAvatar, keyId: candidate.keyId };
}

function updateUser(userId: string, encryptedAvatar: string | null, version: number): void {
  const previous = users.get(userId);
  if (previous && previous.encryptedAvatar === encryptedAvatar && previous.version === version) {
    return;
  }
  users.set(userId, { encryptedAvatar, version });
  if (previous && previous.version !== version) {
    profileKeys.delete(userId);
  }
  if (userId === currentUserId()) {
    scheduleAllOwnEnvelopes();
  }
  if (!encryptedAvatar) {
    attempted.add(userKey(userId));
    failedAt.delete(userKey(userId));
    setPhoto('user', userId, null);
    return;
  }
  markDirty(userKey(userId));
}

function applyUserFields(userId: string, fields: { encryptedAvatar?: unknown; profileKeyVersion?: unknown }): void {
  if (typeof userId !== 'string' || userId.length === 0 || (fields.encryptedAvatar === undefined && fields.profileKeyVersion === undefined)) {
    return;
  }
  const previous = users.get(userId);
  const encryptedAvatar = fields.encryptedAvatar === undefined ? (previous?.encryptedAvatar ?? null) : normalizePointer(fields.encryptedAvatar);
  const version = isValidProfileKeyVersion(fields.profileKeyVersion) ? fields.profileKeyVersion : (previous?.version ?? DEFAULT_VERSION);
  updateUser(userId, encryptedAvatar, version);
}

function applyParticipant(roomId: string, room: RoomRecord, participant: RoomParticipant): void {
  applyUserFields(participant.id, participant);
  if (participant.profileKeyEnvelope === undefined) {
    return;
  }
  const envelope = normalizeEnvelope(participant.profileKeyEnvelope);
  const previous = room.envelopes.get(participant.id);
  if (envelope) {
    room.envelopes.set(participant.id, envelope);
  } else {
    room.envelopes.delete(participant.id);
  }
  if (previous?.envelope !== envelope?.envelope && !userPhotos.has(participant.id)) {
    markDirty(userKey(participant.id));
  }
  if (participant.id === currentUserId()) {
    scheduleOwnEnvelope(roomId);
  }
}

function validParticipants(value: unknown): RoomParticipant[] {
  return Array.isArray(value) ? (value as unknown[]).filter((entry): entry is RoomParticipant => Boolean(entry) && typeof (entry as RoomParticipant).id === 'string') : [];
}

export function applyRoomSummary(summary: RoomSummary): void {
  if (!summary || typeof summary.id !== 'string') {
    return;
  }
  const participants = validParticipants(summary.participants);
  const previous = rooms.get(summary.id);
  const avatar = summary.encryptedAvatar === undefined ? (previous?.avatar ?? null) : normalizeRoomAvatar(summary.encryptedAvatar);
  const room: RoomRecord = {
    type: summary.type === 'group' || previous?.type === 'group' ? 'group' : 'private',
    participants: new Set(participants.map((participant) => participant.id)),
    envelopes: new Map(previous?.envelopes ?? []),
    avatar: previous?.avatar && avatar && previous.avatar.encryptedAvatar === avatar.encryptedAvatar && previous.avatar.keyId === avatar.keyId ? previous.avatar : avatar,
    blockedBy: summary.blockedBy && typeof summary.blockedBy === 'object' ? { ...summary.blockedBy } : (previous?.blockedBy ?? {}),
  };
  for (const userId of Array.from(room.envelopes.keys())) {
    if (!room.participants.has(userId)) {
      room.envelopes.delete(userId);
    }
  }
  rooms.set(summary.id, room);
  for (const participant of participants) {
    applyParticipant(summary.id, room, participant);
  }
  if (previous?.avatar !== room.avatar) {
    if (room.avatar) {
      markDirty(roomKey(summary.id));
    } else {
      setPhoto('room', summary.id, null);
    }
  }
  if (!previous) {
    notify({ kind: 'room', id: summary.id });
  }
  resolveInterestedRoom(summary.id, room);
  scheduleOwnEnvelope(summary.id);
}

function resolveInterestedRoom(roomId: string, room: RoomRecord): void {
  if ((interest.get(roomKey(roomId)) ?? 0) === 0) {
    return;
  }
  if (room.type === 'group') {
    ensureResolved(roomKey(roomId));
    return;
  }
  const other = otherParticipant(room);
  if (other) {
    ensureResolved(userKey(other));
  }
}

export function applyRoomParticipants(roomId: string, participants: RoomParticipant[]): void {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  const valid = validParticipants(participants);
  room.participants = new Set(valid.map((participant) => participant.id));
  for (const userId of Array.from(room.envelopes.keys())) {
    if (!room.participants.has(userId)) {
      room.envelopes.delete(userId);
    }
  }
  for (const participant of valid) {
    applyParticipant(roomId, room, participant);
  }
  notify({ kind: 'room', id: roomId });
  resolveInterestedRoom(roomId, room);
  scheduleOwnEnvelope(roomId);
}

export function forgetRoom(roomId: string): void {
  if (!rooms.delete(roomId)) {
    return;
  }
  verifiedOwnEnvelopes.delete(roomId);
  setPhoto('room', roomId, null);
  notify({ kind: 'room', id: roomId });
}

export function applySelfUser(user: Partial<SocketUser> | null | undefined): void {
  if (!user || typeof user.id !== 'string') {
    return;
  }
  applyUserFields(user.id, user);
}

export function handleUserAvatarUpdated(payload: { userId?: unknown; encryptedAvatar?: unknown; profileKeyVersion?: unknown }): void {
  if (!payload || typeof payload.userId !== 'string') {
    return;
  }
  applyUserFields(payload.userId, { encryptedAvatar: payload.encryptedAvatar ?? null, profileKeyVersion: payload.profileKeyVersion });
}

export function handleRoomAvatarUpdated(payload: { roomId?: unknown; encryptedAvatar?: unknown; keyId?: unknown }): void {
  if (!payload || typeof payload.roomId !== 'string') {
    return;
  }
  const room = rooms.get(payload.roomId);
  if (!room || room.type !== 'group') {
    return;
  }
  const avatar = normalizeRoomAvatar({ encryptedAvatar: payload.encryptedAvatar, keyId: payload.keyId });
  if (room.avatar?.encryptedAvatar === avatar?.encryptedAvatar && room.avatar?.keyId === avatar?.keyId) {
    return;
  }
  room.avatar = avatar;
  if (avatar) {
    markDirty(roomKey(payload.roomId));
  } else {
    attempted.add(roomKey(payload.roomId));
    setPhoto('room', payload.roomId, null);
  }
}

export function handleProfileKeysUpdated(payload: { roomId?: unknown; keyId?: unknown; envelopes?: unknown }): void {
  if (!payload || typeof payload.roomId !== 'string' || typeof payload.keyId !== 'string' || !payload.envelopes || typeof payload.envelopes !== 'object') {
    return;
  }
  const room = rooms.get(payload.roomId);
  if (!room) {
    return;
  }
  for (const [userId, value] of Object.entries(payload.envelopes as Record<string, unknown>)) {
    const envelope = normalizeEnvelope({ envelope: value, keyId: payload.keyId });
    if (!envelope || !room.participants.has(userId)) {
      continue;
    }
    room.envelopes.set(userId, envelope);
    if (userId === currentUserId()) {
      verifiedOwnEnvelopes.delete(payload.roomId);
      scheduleOwnEnvelope(payload.roomId);
    } else if (!userPhotos.has(userId)) {
      markDirty(userKey(userId));
    }
  }
}

function blockedUsers(): Set<string> {
  const me = currentUserId();
  const blocked = new Set<string>();
  if (!me) {
    return blocked;
  }
  for (const room of rooms.values()) {
    const target = room.blockedBy[me];
    if (typeof target === 'string') {
      blocked.add(target);
    }
  }
  return blocked;
}

export function handleBlockStatus(payload: BlockStatusPayload): void {
  if (!payload || typeof payload.roomId !== 'string' || !payload.blockedBy || typeof payload.blockedBy !== 'object') {
    return;
  }
  const me = currentUserId();
  const room = rooms.get(payload.roomId);
  const previousTarget = me && room ? room.blockedBy[me] : undefined;
  if (room) {
    room.blockedBy = { ...payload.blockedBy };
  }
  const target = me ? payload.blockedBy[me] : undefined;
  if (target === previousTarget) {
    return;
  }
  if (typeof target === 'string') {
    void rotateOwnProfileKey();
  } else {
    scheduleAllOwnEnvelopes();
  }
}

function eligibleForOwnEnvelope(room: RoomRecord, me: string): boolean {
  if (!room.participants.has(me) || isServerManagedRoom(room)) {
    return false;
  }
  const blocked = blockedUsers();
  return !Array.from(room.participants).some((userId) => blocked.has(userId));
}

function scheduleOwnEnvelope(roomId: string): void {
  if (ownEnvelopeChecks.has(roomId)) {
    ownEnvelopeReruns.add(roomId);
    return;
  }
  const task = (async () => {
    do {
      ownEnvelopeReruns.delete(roomId);
      await publishOwnEnvelopeOnce(roomId);
    } while (ownEnvelopeReruns.has(roomId));
  })()
    .catch((error: unknown) => {
      console.error('[e2e] publishing the profile key envelope failed', error);
    })
    .finally(() => {
      ownEnvelopeChecks.delete(roomId);
    });
  ownEnvelopeChecks.set(roomId, task);
}

function scheduleAllOwnEnvelopes(): void {
  for (const roomId of rooms.keys()) {
    scheduleOwnEnvelope(roomId);
  }
}

async function publishOwnEnvelopeOnce(roomId: string): Promise<void> {
  const identity = getCurrentIdentity();
  const socket = activeSocket;
  if (!identity || !socket) {
    return;
  }
  const me = identity.userId;
  const record = users.get(me);
  const room = rooms.get(roomId);
  if (!record?.encryptedAvatar || !room || !eligibleForOwnEnvelope(room, me)) {
    return;
  }
  const generation = getCurrentRoomKey(roomId);
  if (!generation) {
    return;
  }
  const marker = `${generation.keyId}|${record.version}`;
  const existing = room.envelopes.get(me);
  if (existing?.keyId === generation.keyId) {
    if (verifiedOwnEnvelopes.get(roomId) === `${marker}|${existing.envelope}`) {
      return;
    }
    const signedGrant = await unwrapProfileKeyEnvelope(existing.envelope, generation.key, roomId, generation.keyId, me);
    const opened = signedGrant
      ? await verifySignedProfileGrant(signedGrant, {
          ownerId: me,
          roomId,
          expectedVersion: record.version,
          ownerSigningPublicKey: await ownSigningPublicKey(identity),
        })
      : null;
    if (opened) {
      opened.profileKey.fill(0);
      verifiedOwnEnvelopes.set(roomId, `${marker}|${existing.envelope}`);
      return;
    }
  }
  const profileKey = await deriveProfileKey(identity.privateKey, record.version);
  const signing = await deriveSigningKeyPair(identity.privateKey);
  let envelope: string;
  try {
    envelope = await createProfileKeyEnvelope({
      userId: me,
      roomId,
      version: record.version,
      profileKey,
      signingPrivateKey: signing.privateKey,
      roomKey: generation.key,
      keyId: generation.keyId,
    });
  } finally {
    profileKey.fill(0);
    signing.privateKey.fill(0);
  }
  if (getCurrentIdentity() !== identity || users.get(me) !== record || rooms.get(roomId) !== room || activeSocket !== socket) {
    return;
  }
  socket.emit('room:publish-profile-key', { roomId, keyId: generation.keyId, envelope });
  room.envelopes.set(me, { envelope, keyId: generation.keyId });
  verifiedOwnEnvelopes.set(roomId, `${marker}|${envelope}`);
}

async function rotateOwnProfileKey(): Promise<void> {
  const identity = getCurrentIdentity();
  const socket = activeSocket;
  if (!identity || !socket) {
    return;
  }
  const me = identity.userId;
  const record = users.get(me);
  if (!record?.encryptedAvatar) {
    return;
  }
  const currentKey = await deriveProfileKey(identity.privateKey, record.version);
  const pointer = await openUserPhotoPointer(record.encryptedAvatar, currentKey, me, record.version);
  currentKey.fill(0);
  if (!pointer) {
    return;
  }
  const nextVersion = record.version + 1;
  const nextKey = await deriveProfileKey(identity.privateKey, nextVersion);
  const encryptedAvatar = await sealUserPhotoPointer(pointer, nextKey, me, nextVersion);
  nextKey.fill(0);
  if (getCurrentIdentity() !== identity || users.get(me) !== record || activeSocket !== socket) {
    return;
  }
  socket.emit('user:set-avatar', { url: pointer.url, encryptedAvatar, profileKeyVersion: nextVersion });
  updateUser(me, encryptedAvatar, nextVersion);
}

async function handleOwnRotationImpl(roomId: string, generation: RoomKeyGeneration): Promise<void> {
  const identity = getCurrentIdentity();
  const socket = activeSocket;
  const room = rooms.get(roomId);
  if (!identity || !socket || !room || isServerManagedRoom(room)) {
    return;
  }
  const avatar = room.avatar;
  if (room.type === 'group' && avatar && avatar.keyId !== generation.keyId) {
    const previousKey = getRoomKeyGeneration(roomId, avatar.keyId) ?? (await ensureRoomKeyGeneration(socket, roomId, avatar.keyId));
    const pointer = previousKey ? await openRoomPhotoPointer(avatar.encryptedAvatar, previousKey, roomId, avatar.keyId) : null;
    if (pointer && room.avatar === avatar) {
      const encryptedAvatar = await sealRoomPhotoPointer(pointer, generation.key, roomId, generation.keyId);
      socket.emit('room:set-avatar', { roomId, url: pointer.url, encryptedAvatar, keyId: generation.keyId });
      room.avatar = { encryptedAvatar, keyId: generation.keyId };
    }
  }
  const envelopes: Record<string, string> = {};
  for (const userId of Array.from(room.participants)) {
    const existing = room.envelopes.get(userId);
    const record = users.get(userId);
    if (!existing || existing.keyId === generation.keyId || !record) {
      continue;
    }
    const previousKey = getRoomKeyGeneration(roomId, existing.keyId);
    if (!previousKey) {
      continue;
    }
    const signedGrant = await unwrapProfileKeyEnvelope(existing.envelope, previousKey, roomId, existing.keyId, userId);
    if (!signedGrant) {
      continue;
    }
    const signingPublicKey = await signingKeyFor(socket, identity, userId);
    const opened = signingPublicKey
      ? await verifySignedProfileGrant(signedGrant, { ownerId: userId, roomId, expectedVersion: record.version, ownerSigningPublicKey: signingPublicKey })
      : null;
    if (!opened) {
      continue;
    }
    opened.profileKey.fill(0);
    envelopes[userId] = await wrapSignedProfileGrant(signedGrant, generation.key, roomId, generation.keyId, userId);
  }
  if (Object.keys(envelopes).length === 0 || rooms.get(roomId) !== room || activeSocket !== socket) {
    return;
  }
  socket.emit('room:rewrap-profile-keys', { roomId, keyId: generation.keyId, envelopes });
  for (const [userId, envelope] of Object.entries(envelopes)) {
    room.envelopes.set(userId, { envelope, keyId: generation.keyId });
  }
}

export function handleOwnRotation(roomId: string, generation: RoomKeyGeneration): Promise<void> {
  return handleOwnRotationImpl(roomId, generation).catch((error: unknown) => {
    console.error('[e2e] re-sealing profile photos after a rotation failed', error);
  });
}

function handleRoomKeyAvailable(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  scheduleOwnEnvelope(roomId);
  for (const userId of room.participants) {
    if (users.get(userId)?.encryptedAvatar && !userPhotos.has(userId) && attempted.has(userKey(userId))) {
      markDirty(userKey(userId));
    }
  }
  if (room.type === 'group' && room.avatar && !roomPhotos.has(roomId) && attempted.has(roomKey(roomId))) {
    markDirty(roomKey(roomId));
  }
}

function awaitConfirmation(
  socket: AppSocket,
  successEvent: 'user:avatar-updated' | 'room:avatar-updated',
  isMatch: (payload: Record<string, unknown>) => boolean,
  errorEvent: string,
): { promise: Promise<void> } {
  type Handler = (payload: never) => void;
  const generic = socket as unknown as { on: (event: string, handler: Handler) => void; off: (event: string, handler: Handler) => void };
  const promise = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeoutId);
      generic.off(successEvent, onSuccess);
      generic.off('error', onError);
    };
    const onSuccess = (payload: Record<string, unknown>) => {
      if (payload && isMatch(payload)) {
        cleanup();
        resolve();
      }
    };
    const onError = (payload: SocketErrorPayload) => {
      if (payload?.event === errorEvent) {
        cleanup();
        reject(createProfilePhotoError(payload.code, payload.params));
      }
    };
    generic.on(successEvent, onSuccess);
    generic.on('error', onError);
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, CONFIRM_TIMEOUT_MS);
  });
  return { promise };
}

function requireSession(): { identity: CurrentIdentity; socket: AppSocket } {
  const identity = getCurrentIdentity();
  if (!identity) {
    throw createProfilePhotoError(PROFILE_PHOTO_UNAVAILABLE_CODE);
  }
  if (!activeSocket) {
    throw createProfilePhotoError(PROFILE_PHOTO_FAILED_CODE);
  }
  return { identity, socket: activeSocket };
}

export function isProfilePhotoReady(): boolean {
  return Boolean(getCurrentIdentity() && activeSocket);
}

export function nextProfileKeyVersion(): number {
  const me = currentUserId();
  return (me ? (users.get(me)?.version ?? DEFAULT_VERSION) : DEFAULT_VERSION) + 1;
}

export function getProfilePhotoUserId(): string {
  return requireSession().identity.userId;
}

export async function publishMyPhoto(pointer: PhotoPointer, version: number, plaintext: Blob): Promise<void> {
  const { identity, socket } = requireSession();
  const me = identity.userId;
  if (!isValidProfileKeyVersion(version)) {
    throw createProfilePhotoError(PROFILE_PHOTO_FAILED_CODE);
  }
  const userPointer: UserPhotoPointer = { ...pointer, fileVersion: version };
  const profileKey = await deriveProfileKey(identity.privateKey, version);
  let encryptedAvatar: string;
  try {
    encryptedAvatar = await sealUserPhotoPointer(userPointer, profileKey, me, version);
  } catch {
    throw createProfilePhotoError(PROFILE_PHOTO_FAILED_CODE);
  } finally {
    profileKey.fill(0);
  }
  if (getCurrentIdentity() !== identity || activeSocket !== socket) {
    throw createProfilePhotoError(PROFILE_PHOTO_FAILED_CODE);
  }
  const confirmation = awaitConfirmation(
    socket,
    'user:avatar-updated',
    (payload) => payload.userId === me && payload.encryptedAvatar === encryptedAvatar,
    'user:set-avatar',
  );
  socket.emit('user:set-avatar', { url: pointer.url, encryptedAvatar, profileKeyVersion: version });
  updateUser(me, encryptedAvatar, version);
  attempted.add(userKey(me));
  setPhoto('user', me, { cacheKey: userPhotoCacheKey(me, userPointer), url: URL.createObjectURL(plaintext) });
  try {
    await confirmation.promise;
  } catch (error) {
    if (users.get(me)?.encryptedAvatar === encryptedAvatar) {
      markDirty(userKey(me));
    }
    throw error;
  }
}

export async function clearMyPhoto(): Promise<void> {
  const { identity, socket } = requireSession();
  const me = identity.userId;
  const previous = users.get(me);
  const confirmation = awaitConfirmation(socket, 'user:avatar-updated', (payload) => payload.userId === me && payload.encryptedAvatar === null, 'user:clear-avatar');
  socket.emit('user:clear-avatar', {});
  updateUser(me, null, previous?.version ?? DEFAULT_VERSION);
  try {
    await confirmation.promise;
  } catch (error) {
    if (previous?.encryptedAvatar && users.get(me)?.encryptedAvatar === null) {
      updateUser(me, previous.encryptedAvatar, previous.version);
    }
    throw error;
  }
}

export async function canChangeRoomPhoto(roomId: string): Promise<boolean> {
  const socket = activeSocket;
  if (!socket || rooms.get(roomId)?.type !== 'group') {
    return false;
  }
  return canRenameGroup(socket, roomId);
}

async function requireRoomPermission(roomId: string): Promise<AppSocket> {
  const { socket } = requireSession();
  if (!(await canChangeRoomPhoto(roomId))) {
    throw createProfilePhotoError(PROFILE_PHOTO_NOT_ALLOWED_CODE);
  }
  return socket;
}

export async function assertCanChangeRoomPhoto(roomId: string): Promise<void> {
  await requireRoomPermission(roomId);
}

export async function publishRoomPhoto(roomId: string, pointer: PhotoPointer, plaintext: Blob): Promise<void> {
  const socket = await requireRoomPermission(roomId);
  let generation: RoomKeyGeneration;
  try {
    generation = await ensureRoomKeyForSending(socket, roomId);
  } catch {
    throw createProfilePhotoError(PROFILE_PHOTO_FAILED_CODE);
  }
  const encryptedAvatar = await sealRoomPhotoPointer(pointer, generation.key, roomId, generation.keyId);
  const room = rooms.get(roomId);
  if (!room || activeSocket !== socket) {
    throw createProfilePhotoError(PROFILE_PHOTO_FAILED_CODE);
  }
  const previous = room.avatar;
  const confirmation = awaitConfirmation(
    socket,
    'room:avatar-updated',
    (payload) => payload.roomId === roomId && payload.encryptedAvatar === encryptedAvatar,
    'room:set-avatar',
  );
  socket.emit('room:set-avatar', { roomId, url: pointer.url, encryptedAvatar, keyId: generation.keyId });
  room.avatar = { encryptedAvatar, keyId: generation.keyId };
  attempted.add(roomKey(roomId));
  setPhoto('room', roomId, { cacheKey: roomPhotoCacheKey(roomId, pointer), url: URL.createObjectURL(plaintext) });
  try {
    await confirmation.promise;
  } catch (error) {
    if (room.avatar?.encryptedAvatar === encryptedAvatar) {
      room.avatar = previous;
      markDirty(roomKey(roomId));
      if (!previous) {
        setPhoto('room', roomId, null);
      }
    }
    throw error;
  }
}

export async function clearRoomPhoto(roomId: string): Promise<void> {
  const socket = await requireRoomPermission(roomId);
  const room = rooms.get(roomId);
  const previous = room?.avatar ?? null;
  const confirmation = awaitConfirmation(socket, 'room:avatar-updated', (payload) => payload.roomId === roomId && payload.encryptedAvatar === null, 'room:clear-avatar');
  socket.emit('room:clear-avatar', { roomId });
  handleRoomAvatarUpdated({ roomId, encryptedAvatar: null, keyId: null });
  try {
    await confirmation.promise;
  } catch (error) {
    if (previous && room && room.avatar === null) {
      handleRoomAvatarUpdated({ roomId, ...previous });
    }
    throw error;
  }
}

export function resetProfilePhotos(): void {
  stateGeneration += 1;
  for (const photo of userPhotos.values()) {
    URL.revokeObjectURL(photo.url);
  }
  for (const photo of roomPhotos.values()) {
    URL.revokeObjectURL(photo.url);
  }
  for (const entry of profileKeys.values()) {
    entry.key.fill(0);
  }
  userPhotos.clear();
  roomPhotos.clear();
  profileKeys.clear();
  users.clear();
  rooms.clear();
  attempted.clear();
  failedAt.clear();
  rerun.clear();
  ownEnvelopeReruns.clear();
  verifiedOwnEnvelopes.clear();
  notify({ kind: 'reset' });
}

export function getProfilePhotoCacheSize(): number {
  return userPhotos.size + roomPhotos.size;
}

export function attachProfilePhotoSocket(socket: AppSocket): () => void {
  activeSocket = socket;
  notify({ kind: 'ready' });
  scheduleAllOwnEnvelopes();
  return () => {
    if (activeSocket === socket) {
      activeSocket = null;
    }
  };
}

subscribeCurrentIdentity((identity) => {
  if (!identity) {
    stateOwnerId = null;
    resetProfilePhotos();
    return;
  }
  if (stateOwnerId && stateOwnerId !== identity.userId) {
    resetProfilePhotos();
  }
  stateOwnerId = identity.userId;
  notify({ kind: 'ready' });
  scheduleAllOwnEnvelopes();
  for (const key of Array.from(attempted)) {
    if (failedAt.has(key)) {
      markDirty(key);
    }
  }
});

subscribeRoomKeyAvailable(handleRoomKeyAvailable);
subscribeOwnRotation((roomId, generation) => {
  void handleOwnRotation(roomId, generation);
});
