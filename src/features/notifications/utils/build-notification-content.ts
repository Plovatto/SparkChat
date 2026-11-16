import { AVATARS } from '@features/auth/constants/avatars';
import { BoundedMap } from '@lib/cache/bounded-map';
import { systemMessageText } from '@lib/format';
import { translate } from '@lib/i18n/app-i18n';
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
const MAX_CACHED_ICONS = 64;

const iconCache = new BoundedMap<string, Promise<string>>(MAX_CACHED_ICONS);

function truncate(text: string): string {
  return text.length > MAX_BODY_LENGTH ? `${text.slice(0, MAX_BODY_LENGTH)}...` : text;
}

function getMessagePreview(message: MessageView): string {
  if (message.type === 'image') {
    return translate('notifications.sentImage');
  }

  if (message.type === 'audio') {
    return translate('notifications.sentAudio');
  }

  if (message.type === 'file') {
    return message.fileMeta ? translate('notifications.sentNamedFile', { name: message.fileMeta.name }) : translate('notifications.sentFile');
  }

  if (message.type === 'error') {
    return truncate(systemMessageText(message));
  }

  return truncate(message.content);
}

function getSenderIcon(sender: MessageView['sender']): Promise<string> {
  const avatar = sender.avatar !== null ? AVATARS[sender.avatar] : undefined;
  const color = avatar?.color ?? FALLBACK_AVATAR_COLOR;
  const cacheKey = avatar ? `avatar:${sender.avatar}` : `initial:${sender.nickname.trim().charAt(0).toUpperCase()}:${color}`;

  const cached = iconCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const icon = buildNotificationIcon(sender.nickname, color, avatar?.icon);
  iconCache.set(cacheKey, icon);
  return icon;
}

export async function buildNotificationContent(message: MessageView, room: RoomSummary): Promise<NotificationContent> {
  const preview = getMessagePreview(message);
  const senderName = message.sender.unknown ? translate('common.unknownUser') : message.sender.nickname;
  const icon = await getSenderIcon(message.sender);
  const image = message.type === 'image' && !message.deletedForEveryone ? message.content : undefined;

  if (room.type === 'group') {
    return {
      title: room.name ?? translate('common.group'),
      body: `${senderName}: ${preview}`,
      icon,
      ...(image ? { image } : {}),
    };
  }

  return {
    title: senderName,
    body: preview,
    icon,
    ...(image ? { image } : {}),
  };
}
