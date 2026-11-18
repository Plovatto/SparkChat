import { toApiError } from '@lib/api/api-error';
import type { SessionAuth } from '@lib/api/session-auth';
import { decryptMediaContentIfNeeded, ensureRoomKeyForDecryption, isEncryptedMediaUrl, MissingRoomKeyError } from '@lib/e2ee';
import type { AppSocket, MessageFileMeta, MessageView, SocketErrorPayload } from '@lib/socket';
import type { ClientToServerEvents } from '@lib/socket/socket-events';
import { uploadChatAudio, uploadChatFile, uploadChatImage } from '../api/chat-api';
import type { ChatMessage } from '../types';

const DELIVERY_TIMEOUT_MS = 15000;

type OutgoingMessage = Parameters<ClientToServerEvents['message:send']>[0];

async function loadPlainAttachment(socket: AppSocket, message: ChatMessage): Promise<Blob> {
  const url = await decryptMediaContentIfNeeded(socket, message.content, message.roomId, message.fileMeta);
  if (isEncryptedMediaUrl(url)) {
    throw new Error('Attachment could not be decrypted');
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Attachment download failed with status ${response.status}`);
  }
  return response.blob();
}

async function reuploadAttachment(message: ChatMessage, blob: Blob, auth: SessionAuth, targetRoomId: string): Promise<{ url: string; fileMeta: MessageFileMeta }> {
  const mimeType = message.fileMeta?.mimeType || blob.type || 'application/octet-stream';
  const name = message.fileMeta?.name ?? 'attachment';

  if (message.type === 'image') {
    const file = new File([blob], name, { type: mimeType });
    const uploaded = await uploadChatImage(file, auth, targetRoomId);
    return { url: uploaded.url, fileMeta: { name, mimeType: uploaded.mimeType, size: file.size, thumbnailUrl: uploaded.thumbnailUrl } };
  }

  if (message.type === 'audio') {
    const uploaded = await uploadChatAudio(blob, mimeType, auth, targetRoomId);
    return { url: uploaded.url, fileMeta: { name, mimeType, size: blob.size } };
  }

  const file = new File([blob], name, { type: mimeType });
  const uploaded = await uploadChatFile(file, auth, targetRoomId);
  return { url: uploaded.url, fileMeta: { name, mimeType, size: file.size } };
}

function sendAndConfirm(socket: AppSocket, payload: Omit<OutgoingMessage, 'clientTempId'>): Promise<void> {
  const clientTempId = `fwd-${crypto.randomUUID()}`;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      socket.off('message:new', handleNew);
      socket.off('error', handleError);
    };
    const handleNew = (message: MessageView & { clientTempId?: string }) => {
      if (message.clientTempId === clientTempId) {
        cleanup();
        resolve();
      }
    };
    const handleError = (error: SocketErrorPayload) => {
      if (error.clientTempId === clientTempId) {
        cleanup();
        reject(toApiError(error, 'chat.forward.failed'));
      }
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Forward was not confirmed in time'));
    }, DELIVERY_TIMEOUT_MS);

    socket.on('message:new', handleNew);
    socket.on('error', handleError);
    socket.emit('message:send', { ...payload, clientTempId });
  });
}

export async function forwardMessage(socket: AppSocket, auth: SessionAuth, message: ChatMessage, targetRoomId: string): Promise<void> {
  const targetKey = await ensureRoomKeyForDecryption(socket, targetRoomId);
  if (!targetKey) {
    throw new MissingRoomKeyError();
  }

  if (message.type !== 'image' && message.type !== 'audio' && message.type !== 'file') {
    await sendAndConfirm(socket, { roomId: targetRoomId, content: message.content, type: 'text' });
    return;
  }

  const blob = await loadPlainAttachment(socket, message);
  const { url, fileMeta } = await reuploadAttachment(message, blob, auth, targetRoomId);

  await sendAndConfirm(socket, {
    roomId: targetRoomId,
    content: url,
    type: message.type,
    duration: message.duration && message.duration > 0 ? message.duration : undefined,
    fileMeta,
    caption: message.caption ?? undefined,
  });
}
