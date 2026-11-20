import { getSodium } from './sodium';

export const GROUP_EVENT_VERSION = 1;
export const ATTESTATION_PARAM = 'att';
export const ATTESTED_EVENT_TYPES = ['group.memberJoined', 'group.memberLeft', 'group.memberRemoved', 'group.adminPromoted'] as const;

export type AttestedEventType = (typeof ATTESTED_EVENT_TYPES)[number];

const EVENT_SIGN_CONTEXT = 'sparkchat:group-event:v1';
const SIGNATURE_BYTES = 64;
const MAX_ATTESTATION_LENGTH = 1200;
const COUNTER_STORAGE_PREFIX = 'sparkchat:group-event-counter:';

export interface GroupEventFields {
  roomId: string;
  epoch: number;
  type: AttestedEventType;
  actorId: string;
  targetId: string | null;
  counter: number;
}

export interface GroupEventAttestation extends GroupEventFields {
  v: typeof GROUP_EVENT_VERSION;
  sig: string;
}

export function isAttestedEventType(value: unknown): value is AttestedEventType {
  return typeof value === 'string' && (ATTESTED_EVENT_TYPES as readonly string[]).includes(value);
}

function signedMessage(fields: GroupEventFields): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([EVENT_SIGN_CONTEXT, fields.roomId, fields.epoch, fields.type, fields.actorId, fields.targetId, fields.counter]),
  );
}

export async function signGroupEvent(fields: GroupEventFields, signingPrivateKey: Uint8Array): Promise<string> {
  const sodium = await getSodium();
  const attestation: GroupEventAttestation = {
    v: GROUP_EVENT_VERSION,
    roomId: fields.roomId,
    epoch: fields.epoch,
    type: fields.type,
    actorId: fields.actorId,
    targetId: fields.targetId,
    counter: fields.counter,
    sig: sodium.to_base64(sodium.crypto_sign_detached(signedMessage(fields), signingPrivateKey)),
  };
  return JSON.stringify(attestation);
}

export function parseGroupEventAttestation(raw: unknown): GroupEventAttestation | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_ATTESTATION_LENGTH) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const candidate = parsed as Record<string, unknown>;
  const { v, roomId, epoch, type, actorId, targetId, counter, sig } = candidate;
  if (
    v !== GROUP_EVENT_VERSION ||
    typeof roomId !== 'string' ||
    typeof epoch !== 'number' ||
    !Number.isSafeInteger(epoch) ||
    epoch < 0 ||
    !isAttestedEventType(type) ||
    typeof actorId !== 'string' ||
    (targetId !== null && typeof targetId !== 'string') ||
    typeof counter !== 'number' ||
    !Number.isSafeInteger(counter) ||
    counter < 0 ||
    typeof sig !== 'string'
  ) {
    return null;
  }
  return { v, roomId, epoch, type, actorId, targetId, counter, sig };
}

export async function verifyGroupEvent(attestation: GroupEventAttestation, signerSigningPublicKey: string): Promise<boolean> {
  try {
    const sodium = await getSodium();
    const signature = sodium.from_base64(attestation.sig);
    const publicKey = sodium.from_base64(signerSigningPublicKey);
    if (signature.length !== SIGNATURE_BYTES || publicKey.length !== sodium.crypto_sign_PUBLICKEYBYTES) {
      return false;
    }
    return sodium.crypto_sign_verify_detached(signature, signedMessage(attestation), publicKey);
  } catch {
    return false;
  }
}

export function eventIdentity(attestation: GroupEventAttestation): string {
  return [attestation.roomId, attestation.actorId, attestation.type, attestation.targetId ?? '', attestation.counter].join('|');
}

const lastCounters = new Map<string, number>();

function readStoredCounter(key: string): number {
  try {
    const value = Number(globalThis.localStorage?.getItem(COUNTER_STORAGE_PREFIX + key));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeStoredCounter(key: string, value: number): void {
  try {
    globalThis.localStorage?.setItem(COUNTER_STORAGE_PREFIX + key, String(value));
  } catch {
    return;
  }
}

export function nextEventCounter(roomId: string, actorId: string, now: number = Date.now()): number {
  const key = `${actorId}|${roomId}`;
  const previous = Math.max(lastCounters.get(key) ?? 0, readStoredCounter(key));
  const next = Math.max(previous + 1, now);
  lastCounters.set(key, next);
  writeStoredCounter(key, next);
  return next;
}

export function resetEventCounters(): void {
  lastCounters.clear();
}

export function attestationParam(params: Record<string, unknown> | undefined): unknown {
  return params?.[ATTESTATION_PARAM];
}
