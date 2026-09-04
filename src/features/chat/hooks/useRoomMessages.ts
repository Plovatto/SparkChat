import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useSocket,
  type MessageFileMeta,
  type MessageLinkPreview,
  type MessageReplySnapshot,
  type MessageType,
  type MessageView,
} from '@lib/socket';
import type { ChatMessage } from '../types';

export interface RoomMessagesCurrentUser {
  id: string;
  nickname: string;
  avatar: number;
}

type SendableMessageType = Extract<MessageType, 'text' | 'image' | 'audio' | 'file'>;

const SENDABLE_MESSAGE_TYPES: readonly MessageType[] = ['text', 'image', 'audio', 'file'];

function isSendableMessageType(type: MessageType): type is SendableMessageType {
  return SENDABLE_MESSAGE_TYPES.includes(type);
}

export interface SendMessageInput {
  content: string;
  type: SendableMessageType;
  duration?: number;
  replyTo?: MessageView | null;
  fileMeta?: MessageFileMeta;
  mentionedUserIds?: string[];
  caption?: string;
  linkPreview?: MessageLinkPreview;
}

export interface RoomMessagesState {
  messages: ChatMessage[];
  isLoaded: boolean;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  typingUserIds: string[];
  recordingUserIds: string[];
  sendMessage: (input: SendMessageInput) => void;
  retryMessage: (clientTempId: string) => void;
  loadOlderMessages: () => void;
}

const PENDING_TIMEOUT_MS = 10000;
const MESSAGES_PAGE_SIZE = 10;

function sortMessagesByTimestamp(messages: MessageView[]): MessageView[] {
  return [...messages].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

function normalizeInitialMessagesPage(messages: MessageView[]): MessageView[] {
  const page = messages.length > MESSAGES_PAGE_SIZE ? messages.slice(-MESSAGES_PAGE_SIZE) : messages;
  return sortMessagesByTimestamp(page);
}

function buildReplySnapshot(message: MessageView | null | undefined): MessageReplySnapshot | null {
  if (!message) {
    return null;
  }

  return {
    id: message.id,
    content: message.content,
    type: message.type,
    duration: message.duration,
    fileMeta: message.fileMeta,
    caption: message.caption,
    sender: message.sender,
  };
}

export function useRoomMessages(
  roomId: string | null,
  currentUser: RoomMessagesCurrentUser,
  onBeforeOlderMessagesApplied?: () => void,
): RoomMessagesState {
  const { socket, connected } = useSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [recordingUserIds, setRecordingUserIds] = useState<string[]>([]);
  const pendingTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const isLoadingOlderRef = useRef(false);
  const loadOlderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedInitialPageRef = useRef(false);

  const clearLoadOlderTimeout = () => {
    if (loadOlderTimeoutRef.current) {
      clearTimeout(loadOlderTimeoutRef.current);
      loadOlderTimeoutRef.current = null;
    }
  };

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
    setHasMoreOlder(false);
    setIsLoadingOlder(false);
    isLoadingOlderRef.current = false;
    hasLoadedInitialPageRef.current = false;
    clearLoadOlderTimeout();
    setTypingUserIds([]);
    setRecordingUserIds([]);
    for (const timeoutId of pendingTimeoutsRef.current.values()) {
      clearTimeout(timeoutId);
    }
    pendingTimeoutsRef.current.clear();
  }, [roomId]);

  useEffect(() => {
    if (!socket || !roomId || !connected) {
      return;
    }

    socket.emit('room:view-start', { roomId });
    return () => {
      socket.emit('room:view-stop', { roomId });
    };
  }, [socket, roomId, connected]);

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }

    socket.emit('messages:get', { roomId, limit: MESSAGES_PAGE_SIZE });

    const handleMessagesList = (payload: { roomId: string; messages: MessageView[]; hasMore: boolean }) => {
      if (payload.roomId !== roomId) {
        return;
      }

      if (hasLoadedInitialPageRef.current) {
        isLoadingOlderRef.current = false;
        setIsLoadingOlder(false);
        clearLoadOlderTimeout();
        const sortedPage = sortMessagesByTimestamp(payload.messages);
        onBeforeOlderMessagesApplied?.();
        setMessages((previous) => {
          const existingIds = new Set(previous.map((message) => message.id));
          const oldest = previous[0];
          const olderPage = oldest
            ? sortedPage.filter((message) => new Date(message.timestamp).getTime() < new Date(oldest.timestamp).getTime())
            : sortedPage;
          const olderMessages = olderPage.slice(-MESSAGES_PAGE_SIZE).filter((message) => !existingIds.has(message.id));
          return [...olderMessages, ...previous];
        });
        socket.emit('message:mark-read', { roomId, messageIds: sortedPage.map((message) => message.id) });
      } else {
        hasLoadedInitialPageRef.current = true;
        const initialMessages = normalizeInitialMessagesPage(payload.messages);
        setMessages((previous) => {
          if (previous.length === 0) {
            return initialMessages;
          }
          const historyIds = new Set(initialMessages.map((message) => message.id));
          const liveOnly = previous.filter((message) => !historyIds.has(message.id));
          return [...initialMessages, ...liveOnly].sort(
            (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
          );
        });
        setIsLoaded(true);
        if (initialMessages.length > 0) {
          socket.emit('message:mark-read', { roomId });
        }
      }

      setHasMoreOlder(payload.hasMore);
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

      if (confirmed.sender.id !== currentUser.id && !confirmed.readBy.includes(currentUser.id)) {
        socket.emit('message:mark-read', { roomId, messageIds: [confirmed.id] });
      }
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
  }, [socket, roomId, currentUser.id, clearPendingTimeout, onBeforeOlderMessagesApplied]);

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
        mentionedUserIds: input.mentionedUserIds ?? [],
        fileMeta: input.fileMeta ?? null,
        caption: input.caption ?? null,
        linkPreview: input.linkPreview ?? null,
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
        fileMeta: input.fileMeta,
        mentionedUserIds: input.mentionedUserIds,
        caption: input.caption,
        linkPreview: input.linkPreview,
      });
    },
    [socket, roomId, currentUser, schedulePendingTimeout],
  );

  const retryMessage = useCallback(
    (clientTempId: string) => {
      const target = messagesRef.current.find((message) => message.clientTempId === clientTempId);
      if (!target || !socket || !roomId || !isSendableMessageType(target.type)) {
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
        type: target.type,
        duration: target.duration ?? undefined,
        replyToMessageId: target.replyTo?.id,
        clientTempId,
        fileMeta: target.fileMeta ?? undefined,
        caption: target.caption ?? undefined,
        linkPreview: target.linkPreview ?? undefined,
      });
    },
    [socket, roomId, schedulePendingTimeout],
  );

  const loadOlderMessages = useCallback(() => {
    const oldest = messagesRef.current[0];
    if (!socket || !roomId || !oldest || isLoadingOlderRef.current || !hasMoreOlder) {
      return;
    }

    isLoadingOlderRef.current = true;
    setIsLoadingOlder(true);
    socket.emit('messages:get', { roomId, before: oldest.timestamp, limit: MESSAGES_PAGE_SIZE });

    clearLoadOlderTimeout();
    loadOlderTimeoutRef.current = setTimeout(() => {
      isLoadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }, PENDING_TIMEOUT_MS);
  }, [socket, roomId, hasMoreOlder]);

  return {
    messages,
    isLoaded,
    hasMoreOlder,
    isLoadingOlder,
    typingUserIds,
    recordingUserIds,
    sendMessage,
    retryMessage,
    loadOlderMessages,
  };
}
