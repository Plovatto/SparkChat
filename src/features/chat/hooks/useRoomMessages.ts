import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket, type MessageReplySnapshot, type MessageType, type MessageView } from '@lib/socket';
import type { ChatMessage } from '../types';

export interface RoomMessagesCurrentUser {
  id: string;
  nickname: string;
  avatar: number;
}

export interface SendMessageInput {
  content: string;
  type: Extract<MessageType, 'text' | 'image' | 'audio'>;
  duration?: number;
  replyTo?: MessageView | null;
}

export interface RoomMessagesState {
  messages: ChatMessage[];
  isLoaded: boolean;
  typingUserIds: string[];
  recordingUserIds: string[];
  sendMessage: (input: SendMessageInput) => void;
  retryMessage: (clientTempId: string) => void;
}

const PENDING_TIMEOUT_MS = 10000;

function buildReplySnapshot(message: MessageView | null | undefined): MessageReplySnapshot | null {
  if (!message) {
    return null;
  }

  return {
    id: message.id,
    content: message.content,
    type: message.type,
    duration: message.duration,
    sender: message.sender,
  };
}

export function useRoomMessages(roomId: string | null, currentUser: RoomMessagesCurrentUser): RoomMessagesState {
  const { socket } = useSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [recordingUserIds, setRecordingUserIds] = useState<string[]>([]);
  const pendingTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const clearPendingTimeout = useCallback((clientTempId: string) => {
    const timeoutId = pendingTimeoutsRef.current.get(clientTempId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingTimeoutsRef.current.delete(clientTempId);
    }
  }, []);

  const schedulePendingTimeout = useCallback(
    (clientTempId: string) => {
      clearPendingTimeout(clientTempId);
      const timeoutId = setTimeout(() => {
        pendingTimeoutsRef.current.delete(clientTempId);
        setMessages((previous) =>
          previous.map((message) =>
            message.clientTempId === clientTempId && message.pending
              ? { ...message, pending: false, failed: true }
              : message,
          ),
        );
      }, PENDING_TIMEOUT_MS);
      pendingTimeoutsRef.current.set(clientTempId, timeoutId);
    },
    [clearPendingTimeout],
  );

  useEffect(() => {
    setMessages([]);
    setIsLoaded(false);
    setTypingUserIds([]);
    setRecordingUserIds([]);
    for (const timeoutId of pendingTimeoutsRef.current.values()) {
      clearTimeout(timeoutId);
    }
    pendingTimeoutsRef.current.clear();
  }, [roomId]);

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }

    socket.emit('messages:get', { roomId });
    socket.emit('message:mark-read', { roomId });

    const handleMessagesList = (payload: { roomId: string; messages: MessageView[] }) => {
      if (payload.roomId !== roomId) {
        return;
      }
      setMessages(payload.messages);
      setIsLoaded(true);
    };

    const handleMessageNew = (message: ChatMessage) => {
      if (message.roomId !== roomId) {
        return;
      }

      const { clientTempId, ...rest } = message;
      const confirmed: ChatMessage = rest;

      if (clientTempId) {
        clearPendingTimeout(clientTempId);
      }

      setMessages((previous) => {
        if (clientTempId && previous.some((existing) => existing.clientTempId === clientTempId)) {
          return previous.map((existing) => (existing.clientTempId === clientTempId ? confirmed : existing));
        }
        if (previous.some((existing) => existing.id === confirmed.id)) {
          return previous;
        }
        return [...previous, confirmed];
      });
    };

    const handleSendError = ({ clientTempId }: { message: string; clientTempId?: string }) => {
      if (!clientTempId) {
        return;
      }
      clearPendingTimeout(clientTempId);
      setMessages((previous) =>
        previous.map((message) =>
          message.clientTempId === clientTempId ? { ...message, pending: false, failed: true } : message,
        ),
      );
    };

    const handleReadReceipt = ({ roomId: receiptRoomId, userId }: { roomId: string; userId: string }) => {
      if (receiptRoomId !== roomId) {
        return;
      }
      setMessages((previous) =>
        previous.map((message) =>
          message.sender.id === currentUser.id && !message.readBy.includes(userId)
            ? { ...message, readBy: [...message.readBy, userId], status: 'read' }
            : message,
        ),
      );
    };

    const handleTypingUpdate = ({ roomId: typingRoomId, users }: { roomId: string; users: string[] }) => {
      if (typingRoomId !== roomId) {
        return;
      }
      setTypingUserIds(users.filter((userId) => userId !== currentUser.id));
    };

    const handleRecordingUpdate = ({ roomId: recordingRoomId, users }: { roomId: string; users: string[] }) => {
      if (recordingRoomId !== roomId) {
        return;
      }
      setRecordingUserIds(users.filter((userId) => userId !== currentUser.id));
    };

    const handleMessageDeleted = ({ messageId, roomId: deletedRoomId }: { messageId: string; roomId: string }) => {
      if (deletedRoomId !== roomId) {
        return;
      }
      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId ? { ...message, deletedForEveryone: true, content: '' } : message,
        ),
      );
    };

    const handleMessageUpdated = (updated: MessageView) => {
      if (updated.roomId !== roomId) {
        return;
      }
      setMessages((previous) => previous.map((message) => (message.id === updated.id ? updated : message)));
    };

    socket.on('messages:list', handleMessagesList);
    socket.on('message:new', handleMessageNew);
    socket.on('error', handleSendError);
    socket.on('message:read-receipt', handleReadReceipt);
    socket.on('typing:update', handleTypingUpdate);
    socket.on('recording:update', handleRecordingUpdate);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('message:updated', handleMessageUpdated);

    return () => {
      socket.off('messages:list', handleMessagesList);
      socket.off('message:new', handleMessageNew);
      socket.off('error', handleSendError);
      socket.off('message:read-receipt', handleReadReceipt);
      socket.off('typing:update', handleTypingUpdate);
      socket.off('recording:update', handleRecordingUpdate);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('message:updated', handleMessageUpdated);
    };
  }, [socket, roomId, currentUser.id, clearPendingTimeout]);

  const sendMessage = useCallback(
    (input: SendMessageInput) => {
      if (!socket || !roomId) {
        return;
      }

      const clientTempId = crypto.randomUUID();
      const optimistic: ChatMessage = {
        id: clientTempId,
        roomId,
        sender: { id: currentUser.id, nickname: currentUser.nickname, avatar: currentUser.avatar },
        content: input.content,
        type: input.type,
        duration: input.duration ?? null,
        timestamp: new Date().toISOString(),
        deletedForEveryone: false,
        status: 'sent',
        deliveredTo: [],
        readBy: [],
        playedBy: [],
        replyTo: buildReplySnapshot(input.replyTo),
        clientTempId,
        pending: true,
      };

      setMessages((previous) => [...previous, optimistic]);
      schedulePendingTimeout(clientTempId);

      socket.emit('message:send', {
        roomId,
        content: input.content,
        type: input.type,
        duration: input.duration,
        replyToMessageId: input.replyTo?.id,
        clientTempId,
      });
    },
    [socket, roomId, currentUser, schedulePendingTimeout],
  );

  const retryMessage = useCallback(
    (clientTempId: string) => {
      const target = messagesRef.current.find((message) => message.clientTempId === clientTempId);
      if (!target || !socket || !roomId) {
        return;
      }

      setMessages((previous) =>
        previous.map((message) =>
          message.clientTempId === clientTempId ? { ...message, pending: true, failed: false } : message,
        ),
      );
      schedulePendingTimeout(clientTempId);

      socket.emit('message:send', {
        roomId,
        content: target.content,
        type: target.type as Extract<MessageType, 'text' | 'image' | 'audio'>,
        duration: target.duration ?? undefined,
        replyToMessageId: target.replyTo?.id,
        clientTempId,
      });
    },
    [socket, roomId, schedulePendingTimeout],
  );

  return { messages, isLoaded, typingUserIds, recordingUserIds, sendMessage, retryMessage };
}
