import type { GroupRoster, RosterMember } from './group-invite';
import { getSodium } from './sodium';

export const SIGNED_ROSTER_VERSION = 2;
export const ROTATION_STALL_MS = 120_000;
const ROSTER_SIGN_CONTEXT = 'sparkchat:group-roster:v1';
const SIGNATURE_BYTES = 64;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export interface RosterSigningInput {
  roomId: string;
  keyId: string;
  epoch: number;
  prevKeyId: string | null;
  members: RosterMember[];
  admins: string[];
  issuedBy: string;
  issuedAt: number;
}

export type RosterRejection =
  | 'missing'
  | 'downgrade'
  | 'malformed'
  | 'wrong-issuer'
  | 'epoch-mismatch'
  | 'chain-mismatch'
  | 'unpinned-issuer'
  | 'bad-signature'
  | 'not-admin'
  | 'escalation'
  | 'dropped-members';

export type RosterVerdict = { ok: true; signed: boolean } | { ok: false; reason: RosterRejection };

export interface PreviousGeneration {
  keyId: string;
  roster: GroupRoster | null;
  signed: boolean;
}

export interface RosterVerificationContext {
  roomId: string;
  keyId: string;
  epoch: number;
  envelopeSenderId: string;
  previous: PreviousGeneration | null;
  signedFromEpoch: number | null;
  currentMemberIds: ReadonlySet<string>;
  stallElapsed: boolean;
  resolveSigningKey: (userId: string) => Promise<string | null>;
  now: number;
}

function sortedMembers(members: RosterMember[]): [string, string][] {
  return members.map((member): [string, string] => [member.userId, member.signingPublicKey]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function signedMessage(input: RosterSigningInput): Uint8Array {
  const body = JSON.stringify([
    ROSTER_SIGN_CONTEXT,
    input.roomId,
    input.keyId,
    input.epoch,
    input.prevKeyId,
    sortedMembers(input.members),
    [...input.admins].sort(),
    input.issuedBy,
    input.issuedAt,
  ]);
  return new TextEncoder().encode(body);
}

export async function signRoster(input: RosterSigningInput, signingPrivateKey: Uint8Array): Promise<GroupRoster> {
  const sodium = await getSodium();
  const signature = sodium.crypto_sign_detached(signedMessage(input), signingPrivateKey);
  return {
    epoch: input.epoch,
    members: input.members.map((member) => ({ userId: member.userId, signingPublicKey: member.signingPublicKey })),
    v: SIGNED_ROSTER_VERSION,
    admins: [...input.admins],
    issuedBy: input.issuedBy,
    issuedAt: input.issuedAt,
    prevKeyId: input.prevKeyId,
    sig: sodium.to_base64(signature),
  };
}

export function isSignedRoster(roster: GroupRoster | null | undefined): boolean {
  return roster?.sig !== undefined;
}

function hasWellFormedSignedFields(roster: GroupRoster): roster is Required<GroupRoster> {
  const ids = roster.members.map((member) => member.userId);
  return (
    roster.v === SIGNED_ROSTER_VERSION &&
    typeof roster.sig === 'string' &&
    typeof roster.issuedBy === 'string' &&
    typeof roster.issuedAt === 'number' &&
    Number.isFinite(roster.issuedAt) &&
    (roster.prevKeyId === null || typeof roster.prevKeyId === 'string') &&
    Array.isArray(roster.admins) &&
    roster.admins.every((id) => typeof id === 'string' && ids.includes(id)) &&
    new Set(roster.admins).size === roster.admins.length &&
    new Set(ids).size === ids.length &&
    ids.includes(roster.issuedBy)
  );
}

export async function verifyRosterSignature(roster: GroupRoster, roomId: string, keyId: string, signerSigningPublicKey: string): Promise<boolean> {
  if (!hasWellFormedSignedFields(roster)) {
    return false;
  }
  try {
    const sodium = await getSodium();
    const signature = sodium.from_base64(roster.sig);
    const publicKey = sodium.from_base64(signerSigningPublicKey);
    if (signature.length !== SIGNATURE_BYTES || publicKey.length !== sodium.crypto_sign_PUBLICKEYBYTES) {
      return false;
    }
    const message = signedMessage({
      roomId,
      keyId,
      epoch: roster.epoch,
      prevKeyId: roster.prevKeyId,
      members: roster.members,
      admins: roster.admins,
      issuedBy: roster.issuedBy,
      issuedAt: roster.issuedAt,
    });
    return sodium.crypto_sign_verify_detached(signature, message, publicKey);
  } catch {
    return false;
  }
}

function isSubset(values: readonly string[], allowed: ReadonlySet<string>): boolean {
  return values.every((value) => allowed.has(value));
}

function authorityRejection(roster: Required<GroupRoster>, context: RosterVerificationContext): RosterRejection | null {
  const previous = context.previous;
  if (!previous?.roster) {
    return null;
  }
  const previousMembers = new Set(previous.roster.members.map((member) => member.userId));
  if (!previousMembers.has(roster.issuedBy)) {
    return 'not-admin';
  }
  if (!previous.signed || !previous.roster.admins) {
    return null;
  }
  const previousAdmins = new Set(previous.roster.admins);
  if (previousAdmins.has(roster.issuedBy)) {
    return null;
  }
  const adminless = ![...previousAdmins].some((id) => context.currentMemberIds.has(id));
  if (!adminless && !context.stallElapsed) {
    return 'not-admin';
  }
  const allowedAdmins = new Set(previousAdmins);
  if (adminless) {
    allowedAdmins.add(roster.issuedBy);
  }
  if (!isSubset(roster.admins, allowedAdmins)) {
    return 'escalation';
  }
  const kept = new Set(roster.members.map((member) => member.userId));
  for (const id of context.currentMemberIds) {
    if (previousMembers.has(id) && !kept.has(id)) {
      return 'dropped-members';
    }
  }
  return null;
}

export async function verifyGroupRoster(roster: GroupRoster | null, context: RosterVerificationContext): Promise<RosterVerdict> {
  const signedRequired = context.signedFromEpoch !== null && context.epoch > context.signedFromEpoch;
  if (!roster) {
    return signedRequired ? { ok: false, reason: 'missing' } : { ok: true, signed: false };
  }
  if (roster.sig === undefined) {
    return signedRequired ? { ok: false, reason: 'downgrade' } : { ok: true, signed: false };
  }
  if (!hasWellFormedSignedFields(roster)) {
    return { ok: false, reason: 'malformed' };
  }
  if (roster.issuedBy !== context.envelopeSenderId) {
    return { ok: false, reason: 'wrong-issuer' };
  }
  if (roster.epoch !== context.epoch) {
    return { ok: false, reason: 'epoch-mismatch' };
  }
  if (context.previous && roster.prevKeyId !== context.previous.keyId) {
    return { ok: false, reason: 'chain-mismatch' };
  }
  const signingKey = await context.resolveSigningKey(roster.issuedBy);
  const issuerEntry = roster.members.find((member) => member.userId === roster.issuedBy);
  if (!signingKey || issuerEntry?.signingPublicKey !== signingKey) {
    return { ok: false, reason: 'unpinned-issuer' };
  }
  if (!(await verifyRosterSignature(roster, context.roomId, context.keyId, signingKey))) {
    return { ok: false, reason: 'bad-signature' };
  }
  const rejection = authorityRejection(roster, context);
  return rejection ? { ok: false, reason: rejection } : { ok: true, signed: true };
}

export function effectiveIssuedAt(roster: GroupRoster, now: number): number {
  const issuedAt = roster.issuedAt ?? 0;
  return Math.min(issuedAt, now + MAX_CLOCK_SKEW_MS);
}

export interface SenderGeneration {
  epoch: number;
  keyId: string;
  roster: GroupRoster | null;
  signed: boolean;
  acceptedAt?: number;
}

export type SenderVerdict = 'ok' | 'after-removal' | 'not-member';

export interface SenderCheck {
  generations: SenderGeneration[];
  keyId: string;
  senderId: string;
  isCurrentMember: boolean;
  timestamp: number;
  live: boolean;
  now: number;
  removedAt?: number | undefined;
}

export function evaluateSender(check: SenderCheck): SenderVerdict {
  const signedGenerations = check.generations.filter((generation) => generation.signed && generation.roster).sort((a, b) => a.epoch - b.epoch);
  const latest = signedGenerations[signedGenerations.length - 1];
  const used = check.generations.find((generation) => generation.keyId === check.keyId);
  if (!latest?.roster || !used) {
    return 'ok';
  }
  const eventTime = check.live ? check.now : check.timestamp;
  const listedNow = latest.roster.members.some((member) => member.userId === check.senderId);
  if (check.removedAt !== undefined && eventTime >= check.removedAt) {
    return 'after-removal';
  }
  if (listedNow) {
    return 'ok';
  }
  if (used.epoch >= latest.epoch) {
    return check.isCurrentMember || !check.live ? 'ok' : 'not-member';
  }
  const next = signedGenerations.find((generation) => generation.epoch > used.epoch);
  if (!next?.roster) {
    return 'ok';
  }
  const issuedAt = effectiveIssuedAt(next.roster, check.now);
  const cutoff = check.live && next.acceptedAt !== undefined ? Math.min(issuedAt, next.acceptedAt) : issuedAt;
  return eventTime >= cutoff ? 'after-removal' : 'ok';
}
