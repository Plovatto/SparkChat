import { toApiError } from '@lib/api/api-error';
import type { SessionAuth } from '@lib/api/session-auth';
import { decryptMediaContentIfNeeded, ensureRoomKeyForSending, isEncryptedMediaUrl } from '@lib/e2ee';
import { isStorageMediaUrl } from '@lib/media/media-origin';
import { isGifMimeType, resolveSafeMediaType } from '@lib/media/media-type';
import type { AppSocket, MessageFileMeta, MessageView, SocketErrorPayload } from '@lib/socket';
import type { ClientToServerEvents } from '@lib/socket/socket-events';
import { uploadChatAudio, uploadChatFile, uploadChatGif, uploadChatImage, type AttachmentTarget } from '../api/chat-api';
import type { ChatMessage } from '../types';
import { toLocalMediaUrl } from './safe-media-url';

const DELIVERY_TIMEOUT_MS = 15000;

type OutgoingMessage = Parameters<ClientToServerEvents['message:send']>[0];

async function loadPlainAttachment(message: ChatMessage): Promise<Blob> {
  const url = await decryptMediaContentIfNeeded(message.content, {
    roomId: message.roomId,
    messageId: message.id,
    fileMeta: message.fileMeta,
    messageType: message.type,
  });
  if (isEncryptedMediaUrl(url)) {
    throw new Error('Attachment could not be decrypted');
  }
  if (!toLocalMediaUrl(url) && !isStorageMediaUrl(url)) {
    throw new Error('Attachment source is not trusted');
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Attachment download failed with status ${response.status}`);
  }
  return response.blob();
}

async function reuploadAttachment(message: ChatMessage, blob: Blob, auth: SessionAuth, target: AttachmentTarget): Promise<{ url: string; fileMeta: MessageFileMeta }> {
  const mimeType = message.fileMeta?.mimeType || blob.type || 'application/octet-stream';
  const name = message.fileMeta?.name ?? 'attachment';

  if (message.type === 'image' && isGifMimeType(mimeType)) {
    const uploaded = await uploadChatGif(new Blob([blob], { type: resolveSafeMediaType('image', mimeType) }), auth, target);
    return { url: uploaded.url, fileMeta: { name: uploaded.name, mimeType: uploaded.mimeType, size: uploaded.size, key: uploaded.key } };
  }

  if (message.type === 'image') {
    const file = new File([blob], name, { type: mimeType });
    const uploaded = await uploadChatImage(file, auth, target);
    return {
      url: uploaded.url,
      fileMeta: {
        name,
        mimeType: uploaded.mimeType,
        size: file.size,
        key: uploaded.key,
        ...(uploaded.thumbnailUrl && uploaded.thumbnailKey ? { thumbnailUrl: uploaded.thumbnailUrl, thumbnailKey: uploaded.thumbnailKey } : {}),
      },
    };
  }

  if (message.type === 'audio') {
    const uploaded = await uploadChatAudio(blob, mimeType, auth, target);
    return { url: uploaded.url, fileMeta: { name, mimeType, size: blob.size, key: uploaded.key } };
  }

  const file = new File([blob], name, { type: mimeType });
  const uploaded = await uploadChatFile(file, auth, target);
  return { url: uploaded.url, fileMeta: { name, mimeType, size: file.size, key: uploaded.key } };
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
  await ensureRoomKeyForSending(socket, targetRoomId);

  if (message.type !== 'image' && message.type !== 'audio' && message.type !== 'file') {
    await sendAndConfirm(socket, { roomId: targetRoomId, content: message.content, type: 'text' });
    return;
  }

  const blob = await loadPlainAttachment(message);
  const messageId = crypto.randomUUID();
  const { url, fileMeta } = await reuploadAttachment(message, blob, auth, { roomId: targetRoomId, messageId });

  await sendAndConfirm(socket, {
    messageId,
    roomId: targetRoomId,
    content: url,
    type: message.type,
    duration: message.duration && message.duration > 0 ? message.duration : undefined,
    fileMeta,
    caption: message.caption ?? undefined,
  });
}

export async function sendTextToRoom(socket: AppSocket, roomId: string, text: string): Promise<void> {
  await ensureRoomKeyForSending(socket, roomId);
  await sendAndConfirm(socket, { roomId, content: text, type: 'text' });
}
