import { isGifMimeType } from '@lib/media/media-type';
import type { MessageFileMeta, RoomParticipant } from '@lib/socket';
import type { ChatMessage } from '../../types';
import { resolveSenderAvatar } from '../../utils/sender-avatar';

export type MediaViewerKind = 'image' | 'video';

export interface MediaViewerItem {
  id: string;
  kind: MediaViewerKind;
  content: string;
  roomId: string;
  fileMeta: MessageFileMeta | null;
  caption: string | null;
  senderId: string;
  senderName: string;
  senderAvatar: number | undefined;
  timestamp: string;
  isGif: boolean;
  message?: ChatMessage;
  directUrl?: string;
  downloadName?: string;
}

export function isViewerMedia(message: ChatMessage): boolean {
  if (message.deletedForEveryone || message.pending || message.failed || !message.content) {
    return false;
  }
  if (message.type === 'image') {
    return true;
  }
  return message.type === 'file' && Boolean(message.fileMeta?.mimeType.startsWith('video/'));
}

export function toMediaViewerItems(messages: readonly ChatMessage[], participants: readonly RoomParticipant[] = []): MediaViewerItem[] {
  return messages
    .filter(isViewerMedia)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((message) => {
      const participant = participants.find((candidate) => candidate.id === message.sender.id);
      return {
        id: message.id,
        kind: message.type === 'image' ? 'image' : 'video',
        content: message.content,
        roomId: message.roomId,
        fileMeta: message.fileMeta,
        caption: message.caption?.trim() ? message.caption.trim() : null,
        senderId: message.sender.id,
        senderName: participant?.nickname ?? message.sender.nickname,
        senderAvatar: resolveSenderAvatar(participants, message.sender),
        timestamp: message.timestamp,
        isGif: message.type === 'image' && isGifMimeType(message.fileMeta?.mimeType),
        message,
      };
    });
}

export function clampViewerIndex(index: number, length: number): number {
  if (length === 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), length - 1);
}
