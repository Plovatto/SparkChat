import type { MessageView, RoomSummary } from '@lib/socket';

export interface NotificationContent {
  title: string;
  body: string;
}

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

  return truncate(message.content);
}

export function buildNotificationContent(message: MessageView, room: RoomSummary): NotificationContent {
  const preview = getMessagePreview(message);

  if (room.type === 'group') {
    return {
      title: room.name ?? 'Grupo',
      body: `${message.sender.nickname}: ${preview}`,
    };
  }

  return {
    title: message.sender.nickname,
    body: preview,
  };
}
