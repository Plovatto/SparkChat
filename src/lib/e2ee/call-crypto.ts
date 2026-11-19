import type { CurrentIdentity } from './current-identity';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

export type CallKind = 'voice' | 'video';
export type CallRole = 'caller' | 'callee';
export type SignalType = 'offer' | 'answer' | 'candidate' | 'end-of-candidates' | 'ice-restart';

const INVITE_CONTEXT = 'sparkchat:call-invite:v1';
const ACCEPT_CONTEXT = 'sparkchat:call-accept:v1';
const SESSION_CONTEXT = 'sparkchat:call-session:v1';
const SIGNAL_CONTEXT = 'sparkchat:call-signal:v1';
const CALLER_TO_CALLEE = 'caller->callee';
const CALLEE_TO_CALLER = 'callee->caller';
const SIGNAL_TYPES: ReadonlySet<string> = new Set(['offer', 'answer', 'candidate', 'end-of-candidates', 'ice-restart']);
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export const CALL_TIMESTAMP_SKEW_MS = 60_000;
export const MAX_SIGNAL_WIRE_LENGTH = 16 * 1024;
export const MAX_ENVELOPE_WIRE_LENGTH = 4 * 1024;
const MAX_ID_LENGTH = 128;

export interface EphemeralKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface PinnedPeer {
  publicKey: string;
  signingPublicKey: string;
}

export interface InviteContent {
  callId: string;
  roomId: string;
  kind: CallKind;
  callerId: string;
  calleeId: string;
  ekA: string;
  ts: number;
}

export interface AcceptContent {
  callId: string;
  calleeId: string;
  callerId: string;
  deviceId: string;
  ekB: string;
  ts: number;
}

export interface SessionKeys {
  send: Uint8Array;
  receive: Uint8Array;
}

export interface OpenedSignal {
  type: SignalType;
  seq: number;
  epoch: number;
  payload: Record<string, unknown>;
}

interface WireEnvelope {
  v: 1;
  nonce: string;
  box: string;
  sig: string;
}

type Sodium = Awaited<ReturnType<typeof getSodium>>;

export async function newCallId(): Promise<string> {
  const sodium = await getSodium();
  return sodium.to_base64(sodium.randombytes_buf(16));
}

export async function newDeviceId(): Promise<string> {
  const sodium = await getSodium();
  return sodium.to_base64(sodium.randombytes_buf(8));
}

export async function generateEphemeralKeyPair(): Promise<EphemeralKeyPair> {
  const sodium = await getSodium();
  const pair = sodium.crypto_kx_keypair();
  return { publicKey: pair.publicKey, privateKey: pair.privateKey };
}

export function zeroEphemeralKeyPair(pair: EphemeralKeyPair): void {
  pair.privateKey.fill(0);
  pair.publicKey.fill(0);
}

function isBase64Url(value: unknown, minLength: number, maxLength: number): value is string {
  return typeof value === 'string' && value.length >= minLength && value.length <= maxLength && BASE64URL.test(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isCallId(value: unknown): value is string {
  return isBase64Url(value, 22, 22);
}

function isDeviceId(value: unknown): value is string {
  return isBase64Url(value, 11, 11);
}

function isEphemeralKey(value: unknown): value is string {
  return isBase64Url(value, 43, 43);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withinSkew(ts: number, now: number): boolean {
  return Math.abs(now - ts) <= CALL_TIMESTAMP_SKEW_MS;
}

function canonical(context: string, fields: readonly string[], nonce: string, box: string): Uint8Array {
  return new TextEncoder().encode(`${context}\n${fields.join('\n')}\n${nonce}\n${box}`);
}

async function sealSigned(
  context: string,
  fields: readonly string[],
  body: object,
  identity: CurrentIdentity,
  recipientPublicKey: string,
): Promise<string> {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const box = sodium.crypto_box_easy(sodium.from_string(JSON.stringify(body)), nonce, sodium.from_base64(recipientPublicKey), identity.privateKey);
  const nonceText = sodium.to_base64(nonce);
  const boxText = sodium.to_base64(box);
  const signing = await deriveSigningKeyPair(identity.privateKey);
  const signature = sodium.crypto_sign_detached(canonical(context, fields, nonceText, boxText), signing.privateKey);
  signing.privateKey.fill(0);
  const wire: WireEnvelope = { v: 1, nonce: nonceText, box: boxText, sig: sodium.to_base64(signature) };
  return JSON.stringify(wire);
}

async function openSigned(
  context: string,
  fieldsOf: (body: Record<string, unknown>) => string[] | null,
  wire: unknown,
  sender: PinnedPeer,
  identity: CurrentIdentity,
): Promise<Record<string, unknown> | null> {
  if (typeof wire !== 'string' || wire.length === 0 || wire.length > MAX_ENVELOPE_WIRE_LENGTH) {
    return null;
  }
  try {
    const sodium = await getSodium();
    const parsed: unknown = JSON.parse(wire);
    if (!isRecord(parsed) || parsed.v !== 1) {
      return null;
    }
    const { nonce, box, sig } = parsed;
    if (!isBase64Url(nonce, 1, 64) || !isBase64Url(box, 1, 2048) || !isBase64Url(sig, 1, 128)) {
      return null;
    }
    const nonceBytes = sodium.from_base64(nonce);
    const signature = sodium.from_base64(sig);
    const senderSigning = sodium.from_base64(sender.signingPublicKey);
    if (
      nonceBytes.length !== sodium.crypto_box_NONCEBYTES ||
      signature.length !== sodium.crypto_sign_BYTES ||
      senderSigning.length !== sodium.crypto_sign_PUBLICKEYBYTES
    ) {
      return null;
    }
    const plain = sodium.crypto_box_open_easy(sodium.from_base64(box), nonceBytes, sodium.from_base64(sender.publicKey), identity.privateKey);
    const body: unknown = JSON.parse(sodium.to_string(plain));
    if (!isRecord(body) || body.v !== 1) {
      return null;
    }
    const fields = fieldsOf(body);
    if (!fields) {
      return null;
    }
    if (!sodium.crypto_sign_verify_detached(signature, canonical(context, fields, nonce, box), senderSigning)) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}

function inviteFields(body: Record<string, unknown>): string[] | null {
  const { callId, roomId, kind, callerId, calleeId, ekA, ts } = body;
  if (!isCallId(callId) || !isId(roomId) || (kind !== 'voice' && kind !== 'video')) {
    return null;
  }
  if (!isId(callerId) || !isId(calleeId) || !isEphemeralKey(ekA) || !isTimestamp(ts)) {
    return null;
  }
  return [callId, roomId, kind, callerId, calleeId, ekA, String(ts)];
}

function acceptFields(body: Record<string, unknown>): string[] | null {
  const { callId, calleeId, callerId, deviceId, ekB, ts } = body;
  if (!isCallId(callId) || !isId(calleeId) || !isId(callerId) || !isDeviceId(deviceId) || !isEphemeralKey(ekB) || !isTimestamp(ts)) {
    return null;
  }
  return [callId, calleeId, callerId, deviceId, ekB, String(ts)];
}

export interface CreateInviteInput {
  identity: CurrentIdentity;
  calleePublicKey: string;
  callId: string;
  roomId: string;
  kind: CallKind;
  calleeId: string;
  ekA: Uint8Array;
  now?: number;
}

export async function createInviteEnvelope(input: CreateInviteInput): Promise<string> {
  const sodium = await getSodium();
  const content: InviteContent = {
    callId: input.callId,
    roomId: input.roomId,
    kind: input.kind,
    callerId: input.identity.userId,
    calleeId: input.calleeId,
    ekA: sodium.to_base64(input.ekA),
    ts: input.now ?? Date.now(),
  };
  const body = { v: 1, ...content };
  const fields = inviteFields(body);
  if (!fields) {
    throw new Error('Invalid call invite.');
  }
  return sealSigned(INVITE_CONTEXT, fields, body, input.identity, input.calleePublicKey);
}

export interface OpenInviteInput {
  identity: CurrentIdentity;
  caller: PinnedPeer;
  claimedCallerId: string;
  claimedRoomId: string;
  claimedKind: CallKind;
  envelope: unknown;
  knownCallIds: ReadonlySet<string>;
  now?: number;
}

export async function openInviteEnvelope(input: OpenInviteInput): Promise<InviteContent | null> {
  const body = await openSigned(INVITE_CONTEXT, inviteFields, input.envelope, input.caller, input.identity);
  if (!body) {
    return null;
  }
  const content = body as unknown as InviteContent;
  const now = input.now ?? Date.now();
  if (
    content.calleeId !== input.identity.userId ||
    content.callerId === input.identity.userId ||
    content.callerId !== input.claimedCallerId ||
    content.roomId !== input.claimedRoomId ||
    content.kind !== input.claimedKind ||
    !withinSkew(content.ts, now) ||
    input.knownCallIds.has(content.callId)
  ) {
    return null;
  }
  return {
    callId: content.callId,
    roomId: content.roomId,
    kind: content.kind,
    callerId: content.callerId,
    calleeId: content.calleeId,
    ekA: content.ekA,
    ts: content.ts,
  };
}

export interface CreateAcceptInput {
  identity: CurrentIdentity;
  callerPublicKey: string;
  callId: string;
  callerId: string;
  deviceId: string;
  ekB: Uint8Array;
  now?: number;
}

export async function createAcceptEnvelope(input: CreateAcceptInput): Promise<string> {
  const sodium = await getSodium();
  const content: AcceptContent = {
    callId: input.callId,
    calleeId: input.identity.userId,
    callerId: input.callerId,
    deviceId: input.deviceId,
    ekB: sodium.to_base64(input.ekB),
    ts: input.now ?? Date.now(),
  };
  const body = { v: 1, ...content };
  const fields = acceptFields(body);
  if (!fields) {
    throw new Error('Invalid call accept.');
  }
  return sealSigned(ACCEPT_CONTEXT, fields, body, input.identity, input.callerPublicKey);
}

export interface OpenAcceptInput {
  identity: CurrentIdentity;
  callee: PinnedPeer;
  expectedCallId: string;
  expectedCalleeId: string;
  envelope: unknown;
  now?: number;
}

export async function openAcceptEnvelope(input: OpenAcceptInput): Promise<AcceptContent | null> {
  const body = await openSigned(ACCEPT_CONTEXT, acceptFields, input.envelope, input.callee, input.identity);
  if (!body) {
    return null;
  }
  const content = body as unknown as AcceptContent;
  const now = input.now ?? Date.now();
  if (
    content.callId !== input.expectedCallId ||
    content.callerId !== input.identity.userId ||
    content.calleeId !== input.expectedCalleeId ||
    content.calleeId === input.identity.userId ||
    !withinSkew(content.ts, now)
  ) {
    return null;
  }
  return {
    callId: content.callId,
    calleeId: content.calleeId,
    callerId: content.callerId,
    deviceId: content.deviceId,
    ekB: content.ekB,
    ts: content.ts,
  };
}

export interface DeriveSessionKeysInput {
  role: CallRole;
  callId: string;
  callerPublicKey: string;
  calleePublicKey: string;
  ownEphemeral: EphemeralKeyPair;
  peerEphemeralPublicKey: string;
}

function directionKey(sodium: Sodium, input: DeriveSessionKeysInput, label: string, kxKey: Uint8Array): Uint8Array {
  const message = sodium.from_string(`${SESSION_CONTEXT}${input.callId}${input.callerPublicKey}${input.calleePublicKey}${label}`);
  return sodium.crypto_generichash(32, message, kxKey);
}

export async function deriveSessionKeys(input: DeriveSessionKeysInput): Promise<SessionKeys> {
  const sodium = await getSodium();
  const peer = sodium.from_base64(input.peerEphemeralPublicKey);
  const kx =
    input.role === 'caller'
      ? sodium.crypto_kx_client_session_keys(input.ownEphemeral.publicKey, input.ownEphemeral.privateKey, peer)
      : sodium.crypto_kx_server_session_keys(input.ownEphemeral.publicKey, input.ownEphemeral.privateKey, peer);
  const sendLabel = input.role === 'caller' ? CALLER_TO_CALLEE : CALLEE_TO_CALLER;
  const receiveLabel = input.role === 'caller' ? CALLEE_TO_CALLER : CALLER_TO_CALLEE;
  const keys: SessionKeys = {
    send: directionKey(sodium, input, sendLabel, kx.sharedTx),
    receive: directionKey(sodium, input, receiveLabel, kx.sharedRx),
  };
  kx.sharedTx.fill(0);
  kx.sharedRx.fill(0);
  return keys;
}

export interface SignalChannelInput {
  callId: string;
  selfId: string;
  peerId: string;
  keys: SessionKeys;
}

export class SignalChannel {
  private readonly callId: string;
  private readonly selfId: string;
  private readonly peerId: string;
  private readonly keys: SessionKeys;
  private sendSeq = 0;
  private lastReceivedSeq = 0;
  private epoch = 0;
  private lastReceivedEpoch = 0;
  private disposed = false;

  constructor(input: SignalChannelInput) {
    this.callId = input.callId;
    this.selfId = input.selfId;
    this.peerId = input.peerId;
    this.keys = input.keys;
  }

  get currentEpoch(): number {
    return this.epoch;
  }

  private associatedData(sender: string, recipient: string, type: string, seq: number, epoch: number): Uint8Array {
    return new TextEncoder().encode(`${SIGNAL_CONTEXT}|${this.callId}|${sender}|${recipient}|${type}|${seq}|${epoch}`);
  }

  async seal(type: SignalType, payload: Record<string, unknown>): Promise<string> {
    if (this.disposed) {
      throw new Error('Signal channel closed.');
    }
    const sodium = await getSodium();
    if (type === 'ice-restart') {
      this.epoch += 1;
    }
    this.sendSeq += 1;
    const seq = this.sendSeq;
    const epoch = this.epoch;
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const plain = sodium.from_string(JSON.stringify({ ...payload, type }));
    const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plain,
      this.associatedData(this.selfId, this.peerId, type, seq, epoch),
      null,
      nonce,
      this.keys.send,
    );
    const wire = JSON.stringify({ v: 1, type, seq, epoch, nonce: sodium.to_base64(nonce), ct: sodium.to_base64(ct) });
    if (wire.length > MAX_SIGNAL_WIRE_LENGTH) {
      throw new Error('Signal too large.');
    }
    return wire;
  }

  async open(wire: unknown, from: string, to: string = this.selfId): Promise<OpenedSignal | null> {
    if (this.disposed || typeof wire !== 'string' || wire.length === 0 || wire.length > MAX_SIGNAL_WIRE_LENGTH) {
      return null;
    }
    if (from !== this.peerId || to !== this.selfId) {
      return null;
    }
    try {
      const sodium = await getSodium();
      const parsed: unknown = JSON.parse(wire);
      if (!isRecord(parsed) || parsed.v !== 1) {
        return null;
      }
      const { type, seq, epoch, nonce, ct } = parsed;
      if (typeof type !== 'string' || !SIGNAL_TYPES.has(type)) {
        return null;
      }
      if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1 || seq <= this.lastReceivedSeq) {
        return null;
      }
      if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch < this.lastReceivedEpoch) {
        return null;
      }
      if (!isBase64Url(nonce, 1, 64) || !isBase64Url(ct, 1, MAX_SIGNAL_WIRE_LENGTH)) {
        return null;
      }
      const nonceBytes = sodium.from_base64(nonce);
      if (nonceBytes.length !== sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES) {
        return null;
      }
      const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        sodium.from_base64(ct),
        this.associatedData(from, to, type, seq, epoch),
        nonceBytes,
        this.keys.receive,
      );
      const body: unknown = JSON.parse(sodium.to_string(plain));
      if (!isRecord(body) || body.type !== type) {
        return null;
      }
      this.lastReceivedSeq = seq;
      this.lastReceivedEpoch = Math.max(this.lastReceivedEpoch, epoch);
      return { type: type as SignalType, seq, epoch, payload: body };
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.keys.send.fill(0);
    this.keys.receive.fill(0);
  }
}
