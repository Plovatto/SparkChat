import type { AppSocket, MessageFileMeta, MessageReplySnapshot, MessageView, RoomSummary } from '@lib/socket';
import { decryptAttachment } from './attachment-crypto';
import { ensureRoomKeyForDecryption, getCachedRoomKey } from './room-keys';
import { getSodium } from './sodium';

export const E2E_PREFIX = 'e2e:v1:';

const UNAVAILABLE_PLACEHOLDER = '🔒 Mensagem criptografada — sem chave local ainda.';
const ENCRYPTED_MEDIA_PARAM = 'e2e';

async function encryptText(plaintext: string, roomKey: Uint8Array): Promise<string> {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, roomKey);
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  return E2E_PREFIX + sodium.to_base64(combined);
}

async function decryptText(payload: string, roomKey: Uint8Array): Promise<string> {
  const sodium = await getSodium();
  const combined = sodium.from_base64(payload.slice(E2E_PREFIX.length));
  const nonce = combined.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = combined.subarray(sodium.crypto_secretbox_NONCEBYTES);
  const plaintextBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, roomKey);
  return sodium.to_string(plaintextBytes);
}

async function decryptTextContentIfNeeded(socket: AppSocket, content: string, roomId: string): Promise<string> {
  if (!content.startsWith(E2E_PREFIX)) {
    return content;
  }

  const roomKey = await ensureRoomKeyForDecryption(socket, roomId);
  if (!roomKey) {
    return UNAVAILABLE_PLACEHOLDER;
  }

  try {
    return await decryptText(content, roomKey);
  } catch {
    return UNAVAILABLE_PLACEHOLDER;
  }
}

function isEncryptedMediaUrl(content: string): boolean {
  try {
    return new URL(content).searchParams.get(ENCRYPTED_MEDIA_PARAM) === '1';
  } catch {
    return false;
  }
}

async function decryptMediaContentIfNeeded(
  socket: AppSocket,
  content: string,
  roomId: string,
  fileMeta: MessageFileMeta | null,
): Promise<string> {
  if (!isEncryptedMediaUrl(content)) {
    return content;
  }

  const roomKey = await ensureRoomKeyForDecryption(socket, roomId);
  if (!roomKey) {
    return content;
  }

  try {
    const response = await fetch(content);
    if (!response.ok) {
      return content;
    }
    const ciphertext = await response.arrayBuffer();
    const blob = await decryptAttachment(roomId, ciphertext, fileMeta?.mimeType ?? 'application/octet-stream');
    if (!blob) {
      return content;
    }
    return URL.createObjectURL(blob);
  } catch {
    return content;
  }
}

async function resolveContent(
  socket: AppSocket,
  content: string,
  roomId: string,
  type: string,
  fileMeta: MessageFileMeta | null,
): Promise<string> {
  return type === 'text'
    ? decryptTextContentIfNeeded(socket, content, roomId)
    : decryptMediaContentIfNeeded(socket, content, roomId, fileMeta);
}

async function decryptReplySnapshot(
  socket: AppSocket,
  reply: MessageReplySnapshot | null,
  roomId: string,
): Promise<MessageReplySnapshot | null> {
  if (!reply) {
    return reply;
  }
  return { ...reply, content: await resolveContent(socket, reply.content, roomId, reply.type, reply.fileMeta) };
}

export async function decryptMessageView(socket: AppSocket, message: MessageView): Promise<MessageView> {
  const [content, replyTo] = await Promise.all([
    resolveContent(socket, message.content, message.roomId, message.type, message.fileMeta),
    decryptReplySnapshot(socket, message.replyTo, message.roomId),
  ]);
  return { ...message, content, replyTo };
}

export function decryptMessageViews(socket: AppSocket, messages: MessageView[]): Promise<MessageView[]> {
  return Promise.all(messages.map((message) => decryptMessageView(socket, message)));
}

export async function decryptRoomSummary(socket: AppSocket, room: RoomSummary): Promise<RoomSummary> {
  if (!room.lastMessage) {
    return room;
  }
  return { ...room, lastMessage: await decryptMessageView(socket, room.lastMessage) };
}

export function decryptRoomSummaries(socket: AppSocket, rooms: RoomSummary[]): Promise<RoomSummary[]> {
  return Promise.all(rooms.map((room) => decryptRoomSummary(socket, room)));
}

export async function encryptOutgoingContent(roomId: string, type: string, content: string): Promise<string> {
  if (type !== 'text') {
    return content;
  }

  const roomKey = getCachedRoomKey(roomId);
  if (!roomKey) {
    return content;
  }

  return encryptText(content, roomKey);
}
