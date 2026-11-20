import { isKeyUsable, listUsableContactIds } from '@lib/e2ee/contact-trust';
import { getCurrentIdentity } from '@lib/e2ee/current-identity';
import { lookupContactKey } from '@lib/e2ee/room-keys';
import { getSodium } from '@lib/e2ee/sodium';
import type { AppSocket } from '@lib/socket';
import { getKtSocketConfig } from './kt-config';
import { isSignedTreeHead, type SignedTreeHead } from './kt-crypto';
import { compareWithOwnHead, resolveLogKey } from './kt-head';
import { raiseKtAlert } from './kt-alerts';
import { loadOwnerState, type OwnAudit } from './kt-store';

const GOSSIP_DOMAIN = 'sparkchat:kt:gossip:v1\n';
const MAX_ENVELOPE_LENGTH = 2048;
const MAX_PEERS_PER_ROUND = 3;
const PEER_COOLDOWN_MS = 10 * 60 * 1000;
const NONCE_BYTES = 24;

const MIN_PROCESS_INTERVAL_MS = 30 * 1000;

const lastSentAt = new Map<string, number>();
const lastProcessedAt = new Map<string, number>();

export function resetGossipState(): void {
  lastSentAt.clear();
  lastProcessedAt.clear();
}

interface GossipMessage {
  v: 1;
  from: string;
  to: string;
  head: SignedTreeHead;
  audit?: OwnAudit;
}

const AUDIT_CLOCK_MARGIN_MS = 10 * 60 * 1000;
const MAX_KEY_LENGTH = 255;

export function readAudit(value: unknown): OwnAudit | null {
  const audit = value as Partial<OwnAudit> | null | undefined;
  if (
    !audit ||
    typeof audit.version !== 'number' ||
    !Number.isInteger(audit.version) ||
    audit.version < 1 ||
    typeof audit.publicKey !== 'string' ||
    audit.publicKey.length === 0 ||
    audit.publicKey.length > MAX_KEY_LENGTH ||
    !(audit.signingPublicKey === null || (typeof audit.signingPublicKey === 'string' && audit.signingPublicKey.length <= MAX_KEY_LENGTH)) ||
    typeof audit.at !== 'number' ||
    !Number.isSafeInteger(audit.at)
  ) {
    return null;
  }
  return { version: audit.version, publicKey: audit.publicKey, signingPublicKey: audit.signingPublicKey ?? null, at: audit.at };
}

export function compareAuditWithAccepted(ownerId: string, senderId: string, audit: OwnAudit): 'ok' | 'conflict' {
  const accepted = loadOwnerState(ownerId).contacts[senderId];
  if (!accepted) {
    return 'ok';
  }
  const sameKeys = accepted.publicKey === audit.publicKey && accepted.signingKey === (audit.signingPublicKey ?? '');
  const conflict =
    (audit.version === accepted.version && !sameKeys) || (audit.version < accepted.version && audit.at - accepted.at > AUDIT_CLOCK_MARGIN_MS);
  if (conflict) {
    raiseKtAlert(ownerId, 'splitView', 'split-view', `audit:${senderId}`);
    return 'conflict';
  }
  return 'ok';
}

async function seal(from: string, to: string, head: SignedTreeHead, audit: OwnAudit | null, recipientPublicKey: string, privateKey: Uint8Array): Promise<string | null> {
  const sodium = await getSodium();
  const message: GossipMessage = { v: 1, from, to, head, ...(audit ? { audit } : {}) };
  const plain = sodium.from_string(GOSSIP_DOMAIN + JSON.stringify(message));
  const nonce = sodium.randombytes_buf(NONCE_BYTES);
  const box = sodium.crypto_box_easy(plain, nonce, sodium.from_base64(recipientPublicKey), privateKey);
  const envelope = new Uint8Array(nonce.length + box.length);
  envelope.set(nonce, 0);
  envelope.set(box, nonce.length);
  const encoded = sodium.to_base64(envelope);
  return encoded.length <= MAX_ENVELOPE_LENGTH ? encoded : null;
}

async function open(envelope: string, senderPublicKey: string, privateKey: Uint8Array): Promise<GossipMessage | null> {
  const sodium = await getSodium();
  if (envelope.length === 0 || envelope.length > MAX_ENVELOPE_LENGTH) {
    return null;
  }
  try {
    const bytes = sodium.from_base64(envelope);
    if (bytes.length <= NONCE_BYTES + sodium.crypto_box_MACBYTES) {
      return null;
    }
    const plain = sodium.crypto_box_open_easy(bytes.subarray(NONCE_BYTES), bytes.subarray(0, NONCE_BYTES), sodium.from_base64(senderPublicKey), privateKey);
    const text = sodium.to_string(plain);
    if (!text.startsWith(GOSSIP_DOMAIN)) {
      return null;
    }
    const parsed = JSON.parse(text.slice(GOSSIP_DOMAIN.length)) as Partial<GossipMessage>;
    if (parsed.v !== 1 || typeof parsed.from !== 'string' || typeof parsed.to !== 'string' || !isSignedTreeHead(parsed.head)) {
      return null;
    }
    const audit = readAudit(parsed.audit);
    return { v: 1, from: parsed.from, to: parsed.to, head: parsed.head, ...(audit ? { audit } : {}) };
  } catch {
    return null;
  }
}

async function sendTo(socket: AppSocket, peerId: string, now: number): Promise<boolean> {
  const identity = getCurrentIdentity();
  const head = identity ? loadOwnerState(identity.userId).head : null;
  if (!identity || !head || head.size === 0) {
    return false;
  }
  const last = lastSentAt.get(`${identity.userId}|${peerId}`);
  if (last !== undefined && now - last < PEER_COOLDOWN_MS) {
    return false;
  }
  const trust = await lookupContactKey(socket, peerId);
  if (!trust?.pin || !isKeyUsable(trust.status)) {
    return false;
  }
  const envelope = await seal(identity.userId, peerId, head, loadOwnerState(identity.userId).ownAudit, trust.pin.publicKey, identity.privateKey);
  if (!envelope) {
    return false;
  }
  lastSentAt.set(`${identity.userId}|${peerId}`, now);
  socket.emit('kt:gossip', { to: peerId, envelope });
  return true;
}

export async function gossipLatestHead(socket: AppSocket, now: number = Date.now()): Promise<number> {
  const identity = getCurrentIdentity();
  if (!identity || !getKtSocketConfig(socket)) {
    return 0;
  }
  const peers = listUsableContactIds()
    .filter((id) => id !== identity.userId)
    .sort(() => Math.random() - 0.5)
    .slice(0, MAX_PEERS_PER_ROUND);
  let sent = 0;
  for (const peer of peers) {
    if (await sendTo(socket, peer, now)) {
      sent += 1;
    }
  }
  return sent;
}

export async function handleGossip(socket: AppSocket, payload: { from: string; envelope: string }, now: number = Date.now()): Promise<void> {
  const config = getKtSocketConfig(socket);
  const identity = getCurrentIdentity();
  if (!config || !identity || typeof payload?.from !== 'string' || typeof payload.envelope !== 'string') {
    return;
  }
  const processedKey = `${identity.userId}|${payload.from}`;
  const previous = lastProcessedAt.get(processedKey);
  if (previous !== undefined && now - previous < MIN_PROCESS_INTERVAL_MS) {
    return;
  }
  lastProcessedAt.set(processedKey, now);
  const resolution = resolveLogKey(identity.userId, config);
  if (!resolution.ok) {
    return;
  }
  const trust = await lookupContactKey(socket, payload.from);
  if (!trust?.pin || !isKeyUsable(trust.status)) {
    return;
  }
  const message = await open(payload.envelope, trust.pin.publicKey, identity.privateKey);
  if (!message || message.from !== payload.from || message.to !== identity.userId) {
    return;
  }
  if (message.audit) {
    compareAuditWithAccepted(identity.userId, payload.from, message.audit);
  }
  await compareWithOwnHead(socket, identity.userId, resolution.logPublicKey, message.head, 'gossip');
  await sendTo(socket, payload.from, now);
}
