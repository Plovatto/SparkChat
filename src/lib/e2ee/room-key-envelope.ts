import { getSodium } from './sodium';

export const ROOM_KEY_ENVELOPE_VERSION = 2;
export const ROOM_KEY_ID_BYTES = 16;
export const ROOM_KEY_BYTES = 32;

const HEADER_CONTEXT = 'sparkchat:room-key:v2';
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export interface RoomKeyEnvelope {
  v: 2;
  roomId: string;
  keyId: string;
  epoch: number;
  senderId: string;
  recipientId: string;
  nonce: string;
  box: string;
  sig: string;
}

export interface SealRoomKeyInput {
  roomKey: Uint8Array;
  roomId: string;
  keyId: string;
  epoch: number;
  senderId: string;
  senderPrivateKey: Uint8Array;
  senderSigningPrivateKey: Uint8Array;
  recipientId: string;
  recipientPublicKey: string;
}

export interface EnvelopeSender {
  publicKey: string;
  signingPublicKey: string;
}

export interface OpenRoomKeyExpectations {
  roomId: string;
  recipientId: string;
  recipientPublicKey: string;
  recipientPrivateKey: Uint8Array;
  isMember: (userId: string) => boolean;
  resolveSender: (userId: string) => Promise<EnvelopeSender | null>;
}

export interface OpenedRoomKey {
  roomId: string;
  keyId: string;
  epoch: number;
  senderId: string;
  roomKey: Uint8Array;
}

export type EnvelopeRejection =
  | 'malformed'
  | 'wrong-room'
  | 'wrong-recipient'
  | 'non-member-sender'
  | 'unpinned-sender'
  | 'bad-signature'
  | 'bad-box';

export class RoomKeyEnvelopeError extends Error {
  readonly reason: EnvelopeRejection;

  constructor(reason: EnvelopeRejection) {
    super(`Room key envelope rejected: ${reason}`);
    this.name = 'RoomKeyEnvelopeError';
    this.reason = reason;
  }
}

export function isValidKeyId(keyId: unknown): keyId is string {
  return typeof keyId === 'string' && KEY_ID_PATTERN.test(keyId);
}

export function isValidEpoch(epoch: unknown): epoch is number {
  return typeof epoch === 'number' && Number.isSafeInteger(epoch) && epoch >= 1;
}

export async function generateRoomKeyId(): Promise<string> {
  const sodium = await getSodium();
  return sodium.to_base64(sodium.randombytes_buf(ROOM_KEY_ID_BYTES), sodium.base64_variants.URLSAFE_NO_PADDING);
}

function headerBytes(envelope: Omit<RoomKeyEnvelope, 'v' | 'sig'>, recipientPublicKey: string): Uint8Array {
  const text = [
    HEADER_CONTEXT,
    envelope.roomId,
    envelope.keyId,
    String(envelope.epoch),
    envelope.senderId,
    envelope.recipientId,
    recipientPublicKey,
    envelope.nonce,
    envelope.box,
  ].join('\n');
  return new TextEncoder().encode(text);
}

export async function sealRoomKeyEnvelope(input: SealRoomKeyInput): Promise<string> {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const box = sodium.crypto_box_easy(input.roomKey, nonce, sodium.from_base64(input.recipientPublicKey), input.senderPrivateKey);
  const unsigned = {
    roomId: input.roomId,
    keyId: input.keyId,
    epoch: input.epoch,
    senderId: input.senderId,
    recipientId: input.recipientId,
    nonce: sodium.to_base64(nonce),
    box: sodium.to_base64(box),
  };
  const sig = sodium.crypto_sign_detached(headerBytes(unsigned, input.recipientPublicKey), input.senderSigningPrivateKey);
  const envelope: RoomKeyEnvelope = { v: ROOM_KEY_ENVELOPE_VERSION, ...unsigned, sig: sodium.to_base64(sig) };
  return JSON.stringify(envelope);
}

function parseEnvelope(sealed: string): RoomKeyEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(sealed);
  } catch {
    throw new RoomKeyEnvelopeError('malformed');
  }
  if (typeof value !== 'object' || value === null) {
    throw new RoomKeyEnvelopeError('malformed');
  }
  const candidate = value as Record<string, unknown>;
  const strings = ['roomId', 'senderId', 'recipientId', 'nonce', 'box', 'sig'] as const;
  if (
    candidate.v !== ROOM_KEY_ENVELOPE_VERSION ||
    !isValidKeyId(candidate.keyId) ||
    !isValidEpoch(candidate.epoch) ||
    strings.some((field) => typeof candidate[field] !== 'string' || candidate[field].length === 0)
  ) {
    throw new RoomKeyEnvelopeError('malformed');
  }
  return candidate as unknown as RoomKeyEnvelope;
}

function decode(sodium: Awaited<ReturnType<typeof getSodium>>, value: string, length?: number): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = sodium.from_base64(value);
  } catch {
    throw new RoomKeyEnvelopeError('malformed');
  }
  if (length !== undefined && bytes.length !== length) {
    throw new RoomKeyEnvelopeError('malformed');
  }
  return bytes;
}

export async function openRoomKeyEnvelope(sealed: string, expected: OpenRoomKeyExpectations): Promise<OpenedRoomKey> {
  const envelope = parseEnvelope(sealed);
  if (envelope.roomId !== expected.roomId) {
    throw new RoomKeyEnvelopeError('wrong-room');
  }
  if (envelope.recipientId !== expected.recipientId) {
    throw new RoomKeyEnvelopeError('wrong-recipient');
  }
  if (!expected.isMember(envelope.senderId)) {
    throw new RoomKeyEnvelopeError('non-member-sender');
  }
  const sender = await expected.resolveSender(envelope.senderId);
  if (!sender) {
    throw new RoomKeyEnvelopeError('unpinned-sender');
  }

  const sodium = await getSodium();
  const signingPublicKey = decode(sodium, sender.signingPublicKey, sodium.crypto_sign_PUBLICKEYBYTES);
  const signature = decode(sodium, envelope.sig, sodium.crypto_sign_BYTES);
  if (!sodium.crypto_sign_verify_detached(signature, headerBytes(envelope, expected.recipientPublicKey), signingPublicKey)) {
    throw new RoomKeyEnvelopeError('bad-signature');
  }

  const nonce = decode(sodium, envelope.nonce, sodium.crypto_box_NONCEBYTES);
  const box = decode(sodium, envelope.box);
  const senderPublicKey = decode(sodium, sender.publicKey, sodium.crypto_box_PUBLICKEYBYTES);
  let roomKey: Uint8Array;
  try {
    roomKey = sodium.crypto_box_open_easy(box, nonce, senderPublicKey, expected.recipientPrivateKey);
  } catch {
    throw new RoomKeyEnvelopeError('bad-box');
  }
  if (roomKey.length !== ROOM_KEY_BYTES) {
    throw new RoomKeyEnvelopeError('bad-box');
  }

  return { roomId: envelope.roomId, keyId: envelope.keyId, epoch: envelope.epoch, senderId: envelope.senderId, roomKey };
}
