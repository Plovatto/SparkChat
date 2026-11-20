import type { AppSocket } from '@lib/socket';
import { getCurrentIdentity } from './current-identity';
import { rememberVerifiedPromotion, revokeVerifiedPromotion } from './group-admins';
import {
  attestationParam,
  eventIdentity,
  isAttestedEventType,
  nextEventCounter,
  parseGroupEventAttestation,
  signGroupEvent,
  verifyGroupEvent,
  type AttestedEventType,
} from './group-events';
import { evaluateSender, type SenderVerdict } from './group-roster';
import {
  currentGroupEpoch,
  getGroupSenderContext,
  getMemberNickname,
  getVerifiedGroupAdmins,
  resolveSigningPublicKey,
  retryDeferredEnvelopes,
} from './room-keys';
import { deriveSigningKeyPair } from './signing';

export type EventTrust = 'verified' | 'legacy' | 'unverified' | 'forged';

export interface SystemMessageLike {
  id: string;
  roomId: string;
  timestamp: string;
  type: string;
  systemEvent?: { type: string; params: Record<string, string | number | null> } | null;
}

const MAX_TRACKED_EVENTS = 5000;
const MAX_PERSISTED_EVENTS = 1000;
const SEEN_STORAGE_PREFIX = 'sparkchat:group-event-seen:';

const seenEvents = new Map<string, string>();
const loadedSeen = new Set<string>();
const attestedNames = new Map<string, { actor?: string; target?: string }>();
const removals = new Map<string, number>();
const signedSince = new Map<string, number>();
const assessments = new Map<string, EventTrust>();

function removalKey(roomId: string, userId: string): string {
  return `${roomId}|${userId}`;
}

function messageTime(message: { timestamp: string }): number {
  const parsed = Date.parse(message.timestamp);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function loadSeen(selfId: string): void {
  if (loadedSeen.has(selfId)) {
    return;
  }
  loadedSeen.add(selfId);
  try {
    const raw = globalThis.localStorage?.getItem(SEEN_STORAGE_PREFIX + selfId);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed === 'object' && parsed !== null) {
      for (const [identity, messageId] of Object.entries(parsed)) {
        if (typeof messageId === 'string' && !seenEvents.has(identity)) {
          seenEvents.set(identity, messageId);
        }
      }
    }
  } catch {
    return;
  }
}

function persistSeen(selfId: string): void {
  try {
    const recent = Array.from(seenEvents).slice(-MAX_PERSISTED_EVENTS);
    globalThis.localStorage?.setItem(SEEN_STORAGE_PREFIX + selfId, JSON.stringify(Object.fromEntries(recent)));
  } catch {
    return;
  }
}

function rememberSeen(identity: string, messageId: string): void {
  if (seenEvents.size >= MAX_TRACKED_EVENTS) {
    const oldest = seenEvents.keys().next().value;
    if (oldest !== undefined) {
      seenEvents.delete(oldest);
    }
  }
  seenEvents.set(identity, messageId);
}

export function getRemovedAt(roomId: string, userId: string): number | undefined {
  return removals.get(removalKey(roomId, userId));
}

export function resetGroupEventTrust(): void {
  seenEvents.clear();
  loadedSeen.clear();
  attestedNames.clear();
  removals.clear();
  signedSince.clear();
  assessments.clear();
}

function noteSignedEvent(roomId: string, at: number): void {
  const known = signedSince.get(roomId);
  if (known === undefined || at < known) {
    signedSince.set(roomId, at);
  }
}

function applyVerifiedEffects(roomId: string, type: AttestedEventType, actorId: string, targetId: string | null, at: number): void {
  const identity = getCurrentIdentity();
  if (identity && type === 'group.memberRemoved' && targetId) {
    revokeVerifiedPromotion(identity.userId, roomId, targetId, at);
  } else if (identity && type === 'group.memberLeft') {
    revokeVerifiedPromotion(identity.userId, roomId, actorId, at);
  }
  if (type === 'group.memberRemoved' && targetId) {
    removals.set(removalKey(roomId, targetId), Math.min(removals.get(removalKey(roomId, targetId)) ?? at, at));
  } else if (type === 'group.memberLeft') {
    removals.set(removalKey(roomId, actorId), Math.min(removals.get(removalKey(roomId, actorId)) ?? at, at));
  } else if (type === 'group.memberJoined') {
    const removedAt = removals.get(removalKey(roomId, actorId));
    if (removedAt !== undefined && at > removedAt) {
      removals.delete(removalKey(roomId, actorId));
    }
  } else if (type === 'group.adminPromoted' && targetId && identity) {
    rememberVerifiedPromotion(identity.userId, roomId, targetId, at);
  }
}

async function assessAttested(socket: AppSocket, message: SystemMessageLike, type: AttestedEventType, raw: unknown): Promise<EventTrust> {
  const attestation = parseGroupEventAttestation(raw);
  if (!attestation || attestation.type !== type || attestation.roomId !== message.roomId) {
    return 'forged';
  }
  const signingKey = await resolveSigningPublicKey(socket, attestation.actorId);
  if (!signingKey) {
    return 'unverified';
  }
  if (!(await verifyGroupEvent(attestation, signingKey))) {
    return 'forged';
  }
  const self = getCurrentIdentity();
  if (self) {
    loadSeen(self.userId);
  }
  const identity = eventIdentity(attestation);
  const owner = seenEvents.get(identity);
  if (owner !== undefined && owner !== message.id) {
    return 'forged';
  }
  if (type === 'group.memberJoined' && attestation.epoch !== 0) {
    return 'forged';
  }
  if (type !== 'group.memberJoined' && attestation.epoch > currentGroupEpoch(message.roomId)) {
    return 'forged';
  }
  if (type === 'group.memberRemoved' || type === 'group.adminPromoted') {
    const admins = getVerifiedGroupAdmins(message.roomId, attestation.epoch);
    if (!admins) {
      return 'unverified';
    }
    if (!admins.has(attestation.actorId)) {
      return 'forged';
    }
  }
  rememberSeen(identity, message.id);
  if (self) {
    persistSeen(self.userId);
  }
  attestedNames.set(message.id, {
    ...(getMemberNickname(message.roomId, attestation.actorId) ? { actor: getMemberNickname(message.roomId, attestation.actorId) } : {}),
    ...(attestation.targetId && getMemberNickname(message.roomId, attestation.targetId) ? { target: getMemberNickname(message.roomId, attestation.targetId) } : {}),
  });
  const at = messageTime(message);
  noteSignedEvent(message.roomId, at);
  applyVerifiedEffects(message.roomId, type, attestation.actorId, attestation.targetId, at);
  if (type === 'group.adminPromoted') {
    void retryDeferredEnvelopes(socket, message.roomId);
  }
  return 'verified';
}

async function assessOne(socket: AppSocket, message: SystemMessageLike): Promise<EventTrust | null> {
  const event = message.systemEvent;
  if (message.type !== 'system' || !event || !isAttestedEventType(event.type)) {
    return null;
  }
  const cached = assessments.get(message.id);
  if (cached) {
    return cached;
  }
  const raw = attestationParam(event.params);
  if (raw === undefined || raw === null) {
    const since = signedSince.get(message.roomId);
    return since !== undefined && messageTime(message) >= since ? 'unverified' : 'legacy';
  }
  const trust = await assessAttested(socket, message, event.type, raw);
  if (trust === 'verified' || trust === 'forged') {
    if (assessments.size >= MAX_TRACKED_EVENTS) {
      assessments.clear();
    }
    assessments.set(message.id, trust);
  }
  return trust;
}

export function getAttestedNames(messageId: string): { actor?: string; target?: string } | undefined {
  return attestedNames.get(messageId);
}

export function assessSystemEvent(socket: AppSocket, message: SystemMessageLike): Promise<EventTrust | null> {
  return assessOne(socket, message);
}

export async function assessSystemEvents(socket: AppSocket, messages: SystemMessageLike[]): Promise<void> {
  const ordered = messages
    .filter((message) => message.type === 'system' && message.systemEvent && isAttestedEventType(message.systemEvent.type))
    .sort((left, right) => messageTime(left) - messageTime(right));
  for (const message of ordered) {
    const raw = attestationParam(message.systemEvent?.params);
    if (raw !== undefined && raw !== null) {
      await assessOne(socket, message);
    }
  }
  for (const message of ordered) {
    await assessOne(socket, message);
  }
}

export interface SenderSource {
  senderId: string;
  timestamp?: string | undefined;
  live?: boolean | undefined;
}

export async function checkGroupSender(roomId: string, keyId: string, source: SenderSource): Promise<SenderVerdict> {
  const identity = getCurrentIdentity();
  if (identity?.userId === source.senderId) {
    return 'ok';
  }
  const context = await getGroupSenderContext(roomId);
  if (!context) {
    return 'ok';
  }
  const parsed = source.timestamp ? Date.parse(source.timestamp) : Number.NaN;
  return evaluateSender({
    generations: context.generations,
    keyId,
    senderId: source.senderId,
    isCurrentMember: context.isMember(source.senderId),
    timestamp: Number.isFinite(parsed) ? parsed : Date.now(),
    live: source.live === true,
    now: Date.now(),
    removedAt: getRemovedAt(roomId, source.senderId),
  });
}

export async function attestGroupAction(roomId: string, type: AttestedEventType, targetId: string | null = null): Promise<string | null> {
  const identity = getCurrentIdentity();
  if (!identity) {
    return null;
  }
  const signing = await deriveSigningKeyPair(identity.privateKey);
  try {
    return await signGroupEvent(
      {
        roomId,
        epoch: type === 'group.memberJoined' ? 0 : currentGroupEpoch(roomId),
        type,
        actorId: identity.userId,
        targetId,
        counter: nextEventCounter(roomId, identity.userId),
      },
      signing.privateKey,
    );
  } catch {
    return null;
  } finally {
    signing.privateKey.fill(0);
  }
}
