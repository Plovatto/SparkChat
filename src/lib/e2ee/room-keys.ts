import { translate } from '@lib/i18n/app-i18n';
import type { AppSocket, E2ePublicKeyEntry, RoomParticipant, RoomSummary, RoomType, SealedRoomKeyEntry } from '@lib/socket';
import { createBatchedLookup } from './batched-lookup';
import { ASSISTANT_USER_ID } from './assistant';
import { isKeyUsable, observeContactKey, type ContactTrust } from './contact-trust';
import { getCurrentIdentity, type CurrentIdentity } from './current-identity';
import {
  createInviteBundle,
  buildInviteLink,
  deriveInviteProof,
  deriveInviteToken,
  openInviteSecret,
  openRoster,
  sealRoster,
  verifyInviteProof,
  type GroupRoster,
} from './group-invite';
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
  inviteProofs: Map<string, string>;
  inviteProofsVersion: number;
}

interface RoomKeyBundle {
  roomId: string;
  keys: SealedRoomKeyEntry[];
}

interface PendingPublish {
  epoch: number;
  startedAt: number;
}

export interface RoomInvite {
  encryptedInvite: string;
  keyId: string;
  active: boolean;
}

interface KnownInvite {
  encryptedInvite: string;
  keyId: string;
  secret: Uint8Array;
}

interface PublishedInvite extends KnownInvite {
  epoch: number;
  encryptedRoster: string;
}

export interface RoomRoster {
  encryptedRoster: string;
  keyId: string;
}

export interface RoomKeyRequest {
  roomId: string;
  requesterId: string;
  proof?: unknown;
}

export interface InviteJoinRequest {
  roomId: string;
  inviteToken: string;
  proof: string;
}

export type RoomInviteListener = (roomId: string) => void;

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
const roomInvites = new Map<string, RoomInvite | null>();
const openedInvites = new Map<string, KnownInvite>();
const publishedInvites = new Map<string, PublishedInvite>();
const roomRosters = new Map<string, RoomRoster | null>();
const knownGroups = new Set<string>();
const pendingInviteRefreshes = new Map<string, Promise<void>>();
const lastInviteRefresh = new Map<string, number>();
const pendingInviteResets = new Map<string, () => void>();
const roomInviteListeners = new Set<RoomInviteListener>();
const INVITE_REFRESH_INTERVAL_MS = 15000;
const INVITE_RESET_TIMEOUT_MS = 30000;
const MAX_INVITE_PROOFS = 500;
const MAX_PROOF_LENGTH = 128;
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

export function subscribeRoomInvite(listener: RoomInviteListener): () => void {
  roomInviteListeners.add(listener);
  return () => {
    roomInviteListeners.delete(listener);
  };
}

function notifyRoomInvite(roomId: string): void {
  for (const listener of Array.from(roomInviteListeners)) {
    try {
      listener(roomId);
    } catch (error) {
      console.error('[e2e] room invite listener failed', error);
    }
  }
}

function isRoomInvite(value: unknown): value is RoomInvite {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RoomInvite>;
  return (
    typeof candidate.encryptedInvite === 'string' &&
    typeof candidate.keyId === 'string' &&
    (candidate.active === undefined || typeof candidate.active === 'boolean')
  );
}

function isRoomRoster(value: unknown): value is RoomRoster {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RoomRoster>;
  return typeof candidate.encryptedRoster === 'string' && typeof candidate.keyId === 'string';
}

function forgetOpenedInvite(roomId: string): void {
  const opened = openedInvites.get(roomId);
  if (opened) {
    opened.secret.fill(0);
    openedInvites.delete(roomId);
  }
}

function sameInvite(left: RoomInvite | null | undefined, right: RoomInvite | null): boolean {
  if (!left || !right) {
    return left === right;
  }
  return left.encryptedInvite === right.encryptedInvite && left.keyId === right.keyId && left.active === right.active;
}

function setRoomInvite(roomId: string, invite: RoomInvite | null, known?: KnownInvite): void {
  if (roomInvites.has(roomId) && sameInvite(roomInvites.get(roomId), invite)) {
    return;
  }
  roomInvites.set(roomId, invite ? { encryptedInvite: invite.encryptedInvite, keyId: invite.keyId, active: invite.active } : null);
  const opened = openedInvites.get(roomId);
  if (!invite || opened?.encryptedInvite !== invite.encryptedInvite || opened.keyId !== invite.keyId) {
    forgetOpenedInvite(roomId);
  }
  if (invite && !openedInvites.has(roomId)) {
    if (known) {
      openedInvites.set(roomId, { encryptedInvite: invite.encryptedInvite, keyId: invite.keyId, secret: known.secret.slice() });
    } else {
      void openInviteLocally(roomId, invite);
    }
  }
  notifyRoomInvite(roomId);
}

function setRoomRoster(roomId: string, roster: RoomRoster | null): void {
  const previous = roomRosters.get(roomId);
  if (roomRosters.has(roomId) && previous?.encryptedRoster === roster?.encryptedRoster && previous?.keyId === roster?.keyId) {
    return;
  }
  roomRosters.set(roomId, roster ? { encryptedRoster: roster.encryptedRoster, keyId: roster.keyId } : null);
  notifyRoomInvite(roomId);
}

function applyRoomInvite(roomId: string, invite: unknown): void {
  if (invite === null) {
    setRoomInvite(roomId, null);
  } else if (isRoomInvite(invite)) {
    setRoomInvite(roomId, { encryptedInvite: invite.encryptedInvite, keyId: invite.keyId, active: invite.active !== false });
  }
}

function applyRoomRoster(roomId: string, roster: unknown): void {
  if (roster === null) {
    setRoomRoster(roomId, null);
  } else if (isRoomRoster(roster)) {
    setRoomRoster(roomId, roster);
  }
}

function applyInviteProofs(roomId: string, view: RoomView, inviteProofs: unknown): void {
  if (!Array.isArray(inviteProofs)) {
    return;
  }
  const proofs = new Map<string, string>();
  for (const entry of inviteProofs.slice(0, MAX_INVITE_PROOFS) as unknown[]) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const { userId, proof } = entry as { userId?: unknown; proof?: unknown };
    if (typeof userId === 'string' && typeof proof === 'string' && proof.length > 0 && proof.length <= MAX_PROOF_LENGTH) {
      proofs.set(userId, proof);
    }
  }
  view.inviteProofs = proofs;
  view.inviteProofsVersion += 1;
  notifyRoomInvite(roomId);
}

function adoptPublishedInvite(roomId: string, generation: RoomKeyGeneration): void {
  const published = publishedInvites.get(roomId);
  if (!published) {
    return;
  }
  if (published.keyId === generation.keyId) {
    publishedInvites.delete(roomId);
    if (roomInvites.get(roomId)?.keyId !== generation.keyId) {
      setRoomInvite(roomId, { encryptedInvite: published.encryptedInvite, keyId: published.keyId, active: true }, published);
    }
    if (roomRosters.get(roomId)?.keyId !== generation.keyId) {
      setRoomRoster(roomId, { encryptedRoster: published.encryptedRoster, keyId: generation.keyId });
    }
    published.secret.fill(0);
  } else if (generation.epoch >= published.epoch) {
    publishedInvites.delete(roomId);
    published.secret.fill(0);
  }
}

function rememberPublishedInvite(roomId: string, invite: PublishedInvite): void {
  publishedInvites.get(roomId)?.secret.fill(0);
  publishedInvites.set(roomId, invite);
}

async function openInviteWithKey(roomId: string, invite: RoomInvite, roomKey: Uint8Array): Promise<Uint8Array | null> {
  const opened = openedInvites.get(roomId);
  if (opened && opened.encryptedInvite === invite.encryptedInvite && opened.keyId === invite.keyId) {
    return opened.secret;
  }
  const secret = await openInviteSecret(invite.encryptedInvite, roomKey, roomId, invite.keyId);
  if (!secret) {
    console.warn('[e2e] discarded a group invite that does not open with its room key', { roomId });
    return null;
  }
  if (!sameInvite(roomInvites.get(roomId), invite)) {
    secret.fill(0);
    return null;
  }
  forgetOpenedInvite(roomId);
  openedInvites.set(roomId, { encryptedInvite: invite.encryptedInvite, keyId: invite.keyId, secret });
  return secret;
}

async function openInviteLocally(roomId: string, invite: RoomInvite): Promise<void> {
  const roomKey = getRoomKeyGeneration(roomId, invite.keyId);
  if (roomKey) {
    await openInviteWithKey(roomId, invite, roomKey);
  }
}

async function openRoomInvite(socket: AppSocket, roomId: string, invite: RoomInvite): Promise<Uint8Array | null> {
  const roomKey = await ensureRoomKeyGeneration(socket, roomId, invite.keyId);
  return roomKey ? openInviteWithKey(roomId, invite, roomKey) : null;
}

function waitForRoomState(roomId: string, isReady: () => boolean, timeoutMs: number): Promise<void> {
  if (isReady()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let timeoutId = 0;
    const unsubscribe = subscribeRoomInvite((changedRoomId) => {
      if (changedRoomId === roomId && isReady()) {
        window.clearTimeout(timeoutId);
        unsubscribe();
        resolve();
      }
    });
    timeoutId = window.setTimeout(() => {
      unsubscribe();
      resolve();
    }, timeoutMs);
  });
}

function refreshRoomState(socket: AppSocket, roomId: string, isReady: () => boolean): Promise<void> {
  const pending = pendingInviteRefreshes.get(roomId);
  if (pending) {
    return pending.then(() => undefined);
  }
  const last = lastInviteRefresh.get(roomId);
  if (last !== undefined && Date.now() - last < INVITE_REFRESH_INTERVAL_MS) {
    return Promise.resolve();
  }
  lastInviteRefresh.set(roomId, Date.now());
  const refresh = waitForRoomState(roomId, isReady, REQUEST_TIMEOUT_MS).finally(() => {
    pendingInviteRefreshes.delete(roomId);
  });
  pendingInviteRefreshes.set(roomId, refresh);
  socket.emit('rooms:get');
  return refresh;
}

async function currentInviteSecret(socket: AppSocket, roomId: string): Promise<Uint8Array | null> {
  await loadPersistedGenerations(roomId);
  const current = sendableGeneration(roomId);
  if (!current) {
    return null;
  }
  const known = roomInvites.get(roomId);
  if (known !== null && known?.keyId !== current.keyId) {
    await refreshRoomState(socket, roomId, () => roomInvites.get(roomId)?.keyId === current.keyId);
  }
  const invite = roomInvites.get(roomId);
  if (!invite?.active || invite.keyId !== current.keyId || sendableGeneration(roomId)?.keyId !== current.keyId) {
    return null;
  }
  return openRoomInvite(socket, roomId, invite);
}

async function inviteSecretForGeneration(socket: AppSocket, roomId: string, keyId: string): Promise<Uint8Array | null> {
  if (roomInvites.get(roomId)?.keyId !== keyId) {
    await refreshRoomState(socket, roomId, () => roomInvites.get(roomId)?.keyId === keyId);
  }
  const invite = roomInvites.get(roomId);
  return invite && invite.keyId === keyId ? openRoomInvite(socket, roomId, invite) : null;
}

async function openCurrentRoster(socket: AppSocket, roomId: string, generation: RoomKeyGeneration): Promise<GroupRoster | null> {
  if (roomRosters.get(roomId)?.keyId !== generation.keyId) {
    await refreshRoomState(socket, roomId, () => roomRosters.get(roomId)?.keyId === generation.keyId);
  }
  const roster = roomRosters.get(roomId);
  if (!roster || roster.keyId !== generation.keyId) {
    return null;
  }
  const opened = await openRoster(roster.encryptedRoster, generation.key, roomId, generation.keyId, generation.epoch);
  if (!opened) {
    console.warn('[e2e] discarded a group roster that does not open with its room key', { roomId });
    return null;
  }
  return opened;
}

async function hasValidInviteProof(
  socket: AppSocket,
  identity: CurrentIdentity,
  roomId: string,
  userId: string,
  proof: unknown,
  secret: Uint8Array,
): Promise<boolean> {
  if (typeof proof !== 'string' || proof.length === 0) {
    return false;
  }
  const sender = await resolveEnvelopeSender(socket, identity, userId);
  return sender !== null && verifyInviteProof(secret, roomId, userId, sender.signingPublicKey, proof);
}

async function verifiedGroupRecipients(
  socket: AppSocket,
  identity: CurrentIdentity,
  view: RoomView,
  roomId: string,
  epoch: number,
): Promise<string[] | null> {
  const members = Array.from(view.members);
  const covered = new Set<string>([identity.userId]);
  const previous = latestGeneration(roomId);
  if (previous) {
    const roster = previous.epoch === epoch - 1 ? await openCurrentRoster(socket, roomId, previous) : null;
    for (const member of roster?.members ?? []) {
      if (!view.members.has(member.userId)) {
        continue;
      }
      const pinned = await resolveEnvelopeSender(socket, identity, member.userId);
      if (pinned?.signingPublicKey !== member.signingPublicKey) {
        console.warn('[e2e] refused a group roster whose signing key differs from the pinned one', { roomId, epoch });
        return null;
      }
      covered.add(member.userId);
    }
    const pending = members.filter((userId) => !covered.has(userId));
    if (pending.some((userId) => !view.inviteProofs.has(userId))) {
      const version = view.inviteProofsVersion;
      await refreshRoomState(socket, roomId, () => view.inviteProofsVersion !== version);
    }
    const secret = pending.length > 0 ? await inviteSecretForGeneration(socket, roomId, previous.keyId) : null;
    if (secret) {
      for (const userId of pending) {
        if (await hasValidInviteProof(socket, identity, roomId, userId, view.inviteProofs.get(userId), secret)) {
          covered.add(userId);
        }
      }
    }
  } else if (view.creatorId !== identity.userId) {
    return null;
  }
  const unverified = members.filter((userId) => !covered.has(userId)).length;
  if (unverified > 0) {
    console.warn('[e2e] cannot verify every member for a new group generation', { roomId, epoch, unverified });
    return null;
  }
  return members;
}

async function buildRoster(socket: AppSocket, identity: CurrentIdentity, epoch: number, memberIds: string[]): Promise<GroupRoster | null> {
  const members = await Promise.all(
    memberIds.map(async (userId) => {
      const sender = await resolveEnvelopeSender(socket, identity, userId);
      return sender ? { userId, signingPublicKey: sender.signingPublicKey } : null;
    }),
  );
  return members.every((member) => member !== null) ? { epoch, members } : null;
}

function requestRoomKey(socket: AppSocket, roomId: string): void {
  socket.emit('e2e:request-room-key', { roomId });
}

async function keyRequestRejection(socket: AppSocket, view: RoomView, request: RoomKeyRequest): Promise<string | null> {
  if (typeof request.proof !== 'string' || request.proof.length === 0) {
    return 'missing-proof';
  }
  const identity = getCurrentIdentity();
  if (!identity) {
    return 'no-identity';
  }
  if (!view.members.has(request.requesterId) || request.requesterId === identity.userId) {
    return 'not-member';
  }
  const sender = await resolveEnvelopeSender(socket, identity, request.requesterId);
  if (!sender) {
    return 'unpinned-requester';
  }
  const secret = await currentInviteSecret(socket, request.roomId);
  if (!secret) {
    return 'no-invite';
  }
  const valid = await verifyInviteProof(secret, request.roomId, request.requesterId, sender.signingPublicKey, request.proof);
  return valid ? null : 'invalid-proof';
}

export async function prepareInviteJoin(roomId: string, secret: Uint8Array): Promise<InviteJoinRequest | null> {
  const identity = getCurrentIdentity();
  if (!identity) {
    return null;
  }
  const [inviteToken, signingPublicKey] = await Promise.all([deriveInviteToken(secret), ownSigningPublicKey(identity)]);
  const proof = await deriveInviteProof(secret, roomId, identity.userId, signingPublicKey);
  if (getCurrentIdentity() !== identity) {
    return null;
  }
  return { roomId, inviteToken, proof };
}

export function isGroupInviteCleared(roomId: string): boolean {
  const invite = roomInvites.get(roomId);
  return invite === null || invite?.active === false;
}

export async function isGroupInviteAvailable(socket: AppSocket, roomId: string): Promise<boolean> {
  if (roomViews.get(roomId)?.type !== 'group') {
    return false;
  }
  return (await currentInviteSecret(socket, roomId)) !== null;
}

export async function getGroupInviteLink(socket: AppSocket, roomId: string, origin: string): Promise<string | null> {
  if (roomViews.get(roomId)?.type !== 'group') {
    return null;
  }
  const secret = await currentInviteSecret(socket, roomId);
  return secret ? buildInviteLink(origin, roomId, secret) : null;
}

export async function resetGroupInvite(socket: AppSocket, roomId: string, timeoutMs = INVITE_RESET_TIMEOUT_MS): Promise<boolean> {
  const identity = getCurrentIdentity();
  const view = roomViews.get(roomId);
  if (!identity || view?.type !== 'group' || !view.members.has(identity.userId)) {
    return false;
  }
  await loadPersistedGenerations(roomId);
  const baseline = Math.max(view.currentEpoch, latestGeneration(roomId)?.epoch ?? 0);
  pendingInviteResets.get(roomId)?.();
  return new Promise((resolve) => {
    const state: { timeoutId: number; unsubscribe: (() => void) | null; settled: boolean } = { timeoutId: 0, unsubscribe: null, settled: false };
    function finish(done: boolean): void {
      if (state.settled) {
        return;
      }
      state.settled = true;
      window.clearTimeout(state.timeoutId);
      state.unsubscribe?.();
      if (pendingInviteResets.get(roomId) === fail) {
        pendingInviteResets.delete(roomId);
      }
      resolve(done);
    }
    function fail(): void {
      finish(false);
    }
    state.unsubscribe = subscribeRoomKeyAvailable((availableRoomId) => {
      if (availableRoomId === roomId && (latestGeneration(roomId)?.epoch ?? 0) > baseline) {
        finish(true);
      }
    });
    pendingInviteResets.set(roomId, fail);
    state.timeoutId = window.setTimeout(fail, timeoutMs);
    socket.emit('room:reset-invite', { roomId });
  });
}

export function handleRoomInviteUpdated(payload: { roomId: string; invite?: unknown; roster?: unknown }): void {
  if (!payload || typeof payload.roomId !== 'string') {
    return;
  }
  applyRoomInvite(payload.roomId, payload.invite ?? null);
  applyRoomRoster(payload.roomId, payload.roster);
}

function errorRoomId(payload: { roomId?: unknown; params?: unknown }): string | null {
  if (typeof payload.roomId === 'string') {
    return payload.roomId;
  }
  const params = payload.params as { roomId?: unknown } | undefined;
  if (params && typeof params.roomId === 'string') {
    return params.roomId;
  }
  return pendingInviteResets.size === 1 ? (Array.from(pendingInviteResets.keys())[0] ?? null) : null;
}

export function handleRoomInviteResetRejected(payload: { roomId?: unknown; params?: unknown }): void {
  const roomId = errorRoomId(payload ?? {});
  if (roomId) {
    pendingInviteResets.get(roomId)?.();
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
  adoptPublishedInvite(roomId, generation);
  const invite = roomInvites.get(roomId);
  if (invite && invite.keyId === generation.keyId) {
    void openInviteLocally(roomId, invite);
  }
  if (persist) {
    void saveRoomKeyGeneration({
      roomId,
      keyId: generation.keyId,
      epoch: generation.epoch,
      key: generation.key,
      ...(knownGroups.has(roomId) ? { roomType: 'group' as const } : {}),
    });
  }
  notifyRoomKeyAvailable(roomId);
  return true;
}

function markGroup(roomId: string): void {
  knownGroups.add(roomId);
  const view = roomViews.get(roomId);
  if (view) {
    view.type = 'group';
  }
}

function applyRoomType(view: RoomView, roomId: string, type: RoomType): void {
  if (knownGroups.has(roomId) || view.type === 'group') {
    if (type !== 'group') {
      console.warn('[e2e] ignored a group relabelled as another room type', { roomId });
    }
    markGroup(roomId);
    return;
  }
  view.type = type;
  if (type === 'group') {
    markGroup(roomId);
  }
}

function loadPersistedGenerations(roomId: string): Promise<void> {
  let load = persistedLoads.get(roomId);
  if (!load) {
    load = loadRoomKeyGenerations(roomId).then((stored) => {
      if (stored.some((entry) => entry.roomType === 'group')) {
        markGroup(roomId);
      }
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
    const isGroup = view.type === 'group';
    if (isGroup && !(await verifiedGroupRecipients(socket, identity, view, roomId, epoch))) {
      pendingPublishes.delete(roomId);
      return;
    }
    const keys = await sealFor(socket, identity, view, roomId, generation, recipients);
    if (!keys) {
      console.warn('[e2e] cannot seal a new room key generation for every member', { roomId, epoch });
      pendingPublishes.delete(roomId);
      return;
    }
    const roster = isGroup ? await buildRoster(socket, identity, epoch, recipients) : null;
    if (isGroup && !roster) {
      pendingPublishes.delete(roomId);
      return;
    }
    const invite = isGroup ? await createInviteBundle(generation.key, roomId, generation.keyId) : null;
    const encryptedRoster = roster ? await sealRoster(roster, generation.key, roomId, generation.keyId) : null;
    if (publishTarget(roomId) !== epoch || getCurrentIdentity() !== identity) {
      invite?.secret.fill(0);
      pendingPublishes.delete(roomId);
      return;
    }
    if (invite && encryptedRoster) {
      rememberPublishedInvite(roomId, {
        encryptedInvite: invite.encryptedInvite,
        keyId: generation.keyId,
        epoch,
        secret: invite.secret,
        encryptedRoster,
      });
      socket.emit('e2e:publish-room-key', {
        roomId,
        keyId: generation.keyId,
        epoch,
        keys,
        invite: { tokenHash: invite.tokenHash, encryptedInvite: invite.encryptedInvite },
        roster: encryptedRoster,
      });
    } else {
      socket.emit('e2e:publish-room-key', { roomId, keyId: generation.keyId, epoch, keys });
    }
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
    requestRoomKey(socket, roomId);
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
      inviteProofs: new Map(),
      inviteProofsVersion: 0,
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
  applyRoomType(view, room.id, room.type);
  view.creatorId = room.creatorId ?? null;
  applyRoomInvite(room.id, room.invite);
  applyRoomRoster(room.id, room.roster);
  applyInviteProofs(room.id, view, room.inviteProofs);
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
    const designated = view.type === 'private' ? options.activeCreation === true : room.creatorId === identity.userId;
    if (designated) {
      await publishGeneration(socket, room.id, 1);
    }
    return;
  }
  if (!sendableGeneration(room.id) && view.currentEpoch > 0) {
    requestRoomKey(socket, room.id);
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
  payload: { roomId: string; epoch: number; memberIds?: string[]; inviteProofs?: unknown },
): Promise<void> {
  const view = roomViews.get(payload.roomId);
  if (!view) {
    return;
  }
  applyInviteProofs(payload.roomId, view, payload.inviteProofs);
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
  if (view.type === 'private') {
    await shareCurrentGeneration(socket, payload.roomId, added);
  }
}

export function updateRoomParticipants(roomId: string, participants: RoomParticipant[]): void {
  const view = roomViews.get(roomId);
  if (view) {
    applyParticipants(view, participants);
  }
}

async function handleKeyRequestImpl(socket: AppSocket, payload: RoomKeyRequest): Promise<void> {
  const view = roomViews.get(payload.roomId);
  if (!view || typeof payload.requesterId !== 'string') {
    return;
  }
  await loadPersistedGenerations(payload.roomId);
  if (view.type !== 'private') {
    const rejection = await keyRequestRejection(socket, view, payload);
    if (rejection) {
      console.warn('[e2e] ignored group key request', { roomId: payload.roomId, requesterId: payload.requesterId, reason: rejection });
      return;
    }
    view.inviteProofs.set(payload.requesterId, payload.proof as string);
  }
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
  for (const roomId of Array.from(openedInvites.keys())) {
    forgetOpenedInvite(roomId);
  }
  for (const published of publishedInvites.values()) {
    published.secret.fill(0);
  }
  publishedInvites.clear();
  roomInvites.clear();
  roomRosters.clear();
  knownGroups.clear();
  pendingInviteRefreshes.clear();
  lastInviteRefresh.clear();
  for (const fail of Array.from(pendingInviteResets.values())) {
    fail();
  }
  pendingInviteResets.clear();
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
