import { AVATARS } from '@features/auth/constants/avatars';
import type { MessageView, RoomSummary } from '@lib/socket';
import { buildNotificationIcon } from './build-notification-icon';

export interface NotificationContent {
  title: string;
  body: string;
  icon: string;
  image?: string;
}

const FALLBACK_AVATAR_COLOR = '#667eea';

const MAX_BODY_LENGTH = 80;

function truncate(text: string): string {
  return text.length > MAX_BODY_LENGTH ? `${text.slice(0, MAX_BODY_LENGTH)}...` : text;
}

function getMessagePreview(message: MessageView): string {
  if (message.type === 'image') {
    return 'Enviou uma imagem';
  }

  if (message.type === 'audio') {
    return 'Enviou um áudio';
  }

  if (message.type === 'file') {
    return `Enviou um arquivo${message.fileMeta ? `: ${message.fileMeta.name}` : ''}`;
  }

  return truncate(message.content);
}

export async function buildNotificationContent(message: MessageView, room: RoomSummary): Promise<NotificationContent> {
  const preview = getMessagePreview(message);
  const avatar = message.sender.avatar !== null ? AVATARS[message.sender.avatar] : undefined;
  const icon = await buildNotificationIcon(message.sender.nickname, avatar?.color ?? FALLBACK_AVATAR_COLOR, avatar?.icon);
  const image = message.type === 'image' && !message.deletedForEveryone ? message.content : undefined;

  if (room.type === 'group') {
    return {
      title: room.name ?? 'Grupo',
      body: `${message.sender.nickname}: ${preview}`,
      icon,
      ...(image ? { image } : {}),
    };
  }

  return {
    title: message.sender.nickname,
    body: preview,
    icon,
    ...(image ? { image } : {}),
  };
}
