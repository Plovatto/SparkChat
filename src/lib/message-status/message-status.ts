import type { MessageView, RoomParticipant } from '@lib/socket';

export interface MessageStatusInfo {
  icon: 'single' | 'double';
  read: boolean;
}

export function getMessageStatus(
  message: MessageView,
  isOwn: boolean,
  isGroupChat: boolean,
  participants: RoomParticipant[],
  currentUserId: string | undefined,
): MessageStatusInfo | null {
  if (!isOwn) {
    return null;
  }

  const { status, readBy, deliveredTo } = message;

  if (isGroupChat && participants.length > 0) {
    const others = participants.filter((participant) => participant.id !== currentUserId);

    if (readBy.length > 0 && others.every((participant) => readBy.includes(participant.id))) {
      return { icon: 'double', read: true };
    }
    if (deliveredTo.length > 0 && others.every((participant) => deliveredTo.includes(participant.id))) {
      return { icon: 'double', read: false };
    }
    return { icon: 'single', read: false };
  }

  if (readBy.length > 0 && readBy.some((id) => id !== currentUserId)) {
    return { icon: 'double', read: true };
  }
  if (status === 'delivered') {
    return { icon: 'double', read: false };
  }
  return { icon: 'single', read: false };
}
