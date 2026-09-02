import type { MessageView, RoomParticipant } from '@lib/socket';

export interface MessageStatusInfo {
  icon: 'single' | 'double';
  read: boolean;
}

export interface MessageReceiptInfo {
  type: 'read' | 'delivered';
  users: RoomParticipant[];
}

interface GroupReceiptBreakdown {
  others: RoomParticipant[];
  readers: RoomParticipant[];
  recipients: RoomParticipant[];
}

interface GroupProgress {
  status: MessageStatusInfo;
  receipt: MessageReceiptInfo | null;
}

function breakdownGroupReceipt(
  message: MessageView,
  participants: RoomParticipant[],
  currentUserId: string | undefined,
): GroupReceiptBreakdown {
  const others = participants.filter((participant) => participant.id !== currentUserId);
  const readers = others.filter((participant) => message.readBy.includes(participant.id));
  const recipients = others.filter((participant) => message.deliveredTo.includes(participant.id));

  return { others, readers, recipients };
}

function classifyGroupProgress({ others, readers, recipients }: GroupReceiptBreakdown): GroupProgress {
  if (others.length === 0) {
    return { status: { icon: 'single', read: false }, receipt: null };
  }
  if (readers.length === others.length) {
    return { status: { icon: 'double', read: true }, receipt: null };
  }
  if (readers.length > 0) {
    return { status: { icon: 'double', read: false }, receipt: { type: 'read', users: readers } };
  }
  if (recipients.length === others.length) {
    return { status: { icon: 'double', read: false }, receipt: null };
  }
  if (recipients.length > 0) {
    return { status: { icon: 'single', read: false }, receipt: { type: 'delivered', users: recipients } };
  }
  return { status: { icon: 'single', read: false }, receipt: null };
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

  if (isGroupChat && participants.length > 0) {
    const breakdown = breakdownGroupReceipt(message, participants, currentUserId);
    return classifyGroupProgress(breakdown).status;
  }

  const { status, readBy } = message;

  if (readBy.length > 0 && readBy.some((id) => id !== currentUserId)) {
    return { icon: 'double', read: true };
  }
  if (status === 'delivered') {
    return { icon: 'double', read: false };
  }
  return { icon: 'single', read: false };
}

export function getMessageReceipt(
  message: MessageView,
  isOwn: boolean,
  isGroupChat: boolean,
  participants: RoomParticipant[],
  currentUserId: string | undefined,
): MessageReceiptInfo | null {
  if (!isOwn || !isGroupChat) {
    return null;
  }

  const breakdown = breakdownGroupReceipt(message, participants, currentUserId);
  return classifyGroupProgress(breakdown).receipt;
}
