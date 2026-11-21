import { useCallback, useEffect, useRef, useState } from 'react';
import { MOTION_DURATION_MS } from '@features/motion';
import { isEncryptedMediaUrl, subscribeRoomKeyAvailable } from '@lib/e2ee';
import { forgetTranslation } from '@lib/translation';
import {
  markPreviewOnlyHandler,
  useSocket,
  type MessageFileMeta,
  type MessageHiddenPayload,
  type MessageLinkPreview,
  type MessageReplySnapshot,
  type MessageType,
  type MessageView,
  type SocketErrorPayload,
} from '@lib/socket';
import type { ChatMessage } from '../types';
import { chunkMessageIds } from '../utils/delete-options';

function linkPreviewAttachmentUrls(linkPreview: { imageUrl: string | null } | null | undefined): string[] | undefined {
  const imageUrl = linkPreview?.imageUrl;
  return imageUrl && isEncryptedMediaUrl(imageUrl) ? [imageUrl] : undefined;
}

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
  messageId?: string;
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
  hideMessages: (messageIds: string[]) => void;
  hideFailed: boolean;
  dismissHideFailure: () => void;
}

interface PendingHide {
  ids: string[];
  messages: ChatMessage[];
  timeoutId: ReturnType<typeof setTimeout>;
}

const PENDING_TIMEOUT_MS = 10000;
const MESSAGE_EXIT_MS = MOTION_DURATION_MS.normal;
const MESSAGES_PAGE_SIZE = 10;

function sortMessagesByTimestamp(messages: MessageView[]): MessageView[] {
  return [...messages].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

function normalizeInitialMessagesPage(messages: MessageView[]): MessageView[] {
  const page = messages.length > MESSAGES_PAGE_SIZE ? messages.slice(-MESSAGES_PAGE_SIZE) : messages;
  return sortMessagesByTimestamp(page);
}

function mapChanged(messages: ChatMessage[], mapper: (message: ChatMessage) => ChatMessage): ChatMessage[] {
  let changed = false;
  const next = messages.map((message) => {
    const mapped = mapper(message);
    if (mapped !== message) {
      changed = true;
    }
    return mapped;
  });
  return changed ? next : messages;
}

function settleExiting(messages: ChatMessage[]): ChatMessage[] {
  return mapChanged(messages, (message) => (message.exiting ? { ...message, exiting: false } : message));
}

function restoreMessages(messages: ChatMessage[], restored: ChatMessage[]): ChatMessage[] {
  const settled = settleExiting(messages);
  const presentIds = new Set(settled.map((message) => message.id));
  const missing = restored.filter((message) => !presentIds.has(message.id)).map((message) => ({ ...message, exiting: false }));
  if (missing.length === 0) {
    return settled;
  }
  return [...settled, ...missing].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
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
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const isRefreshingLatestRef = useRef(false);
  const hasUnreadWhileHiddenRef = useRef(false);
  const isLoadingOlderRef = useRef(false);
  const loadOlderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedInitialPageRef = useRef(false);
  const pendingHidesRef = useRef<PendingHide[]>([]);
  const exitTimeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [hideFailed, setHideFailed] = useState(false);

  const removeWithExit = useCallback((messageIds: string[]) => {
    const ids = new Set(messageIds);
    if (!messagesRef.current.some((message) => ids.has(message.id))) {
      return;
    }
    setMessages((previous) => mapChanged(previous, (message) => (ids.has(message.id) && !message.exiting ? { ...message, exiting: true } : message)));
    const timeoutId = setTimeout(() => {
      exitTimeoutsRef.current.delete(timeoutId);
      setMessages((previous) => {
        const next = previous.filter((message) => !(ids.has(message.id) && message.exiting));
        return next.length === previous.length ? previous : next;
      });
    }, MESSAGE_EXIT_MS);
    exitTimeoutsRef.current.add(timeoutId);
  }, []);

  const rollbackHide = useCallback((pending: PendingHide) => {
    clearTimeout(pending.timeoutId);
    pendingHidesRef.current = pendingHidesRef.current.filter((candidate) => candidate !== pending);
    setHideFailed(true);
    if (pending.messages.length === 0 || pending.messages[0]?.roomId !== roomIdRef.current) {
      return;
    }
    setMessages((previous) => restoreMessages(previous, pending.messages));
  }, []);

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
          mapChanged(previous, (message) =>
            message.clientTempId === clientTempId && message.pending ? { ...message, pending: false, failed: true } : message,
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
    isRefreshingLatestRef.current = false;
    clearLoadOlderTimeout();
    setTypingUserIds([]);
    setRecordingUserIds([]);
    for (const timeoutId of pendingTimeoutsRef.current.values()) {
      clearTimeout(timeoutId);
    }
    pendingTimeoutsRef.current.clear();
    for (const pending of pendingHidesRef.current) {
      clearTimeout(pending.timeoutId);
    }
    pendingHidesRef.current = [];
    for (const timeoutId of exitTimeoutsRef.current) {
      clearTimeout(timeoutId);
    }
    exitTimeoutsRef.current.clear();
    setHideFailed(false);
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
    hasUnreadWhileHiddenRef.current = false;
    if (!socket || !roomId) {
      return;
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && hasUnreadWhileHiddenRef.current) {
        hasUnreadWhileHiddenRef.current = false;
        socket.emit('message:mark-read', { roomId });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [socket, roomId]);

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }

    socket.emit('messages:get', { roomId, limit: MESSAGES_PAGE_SIZE });

    const refreshLatestPage = () => {
      if (!hasLoadedInitialPageRef.current || isLoadingOlderRef.current) {
        return;
      }
      isRefreshingLatestRef.current = true;
      socket.emit('messages:get', { roomId, limit: MESSAGES_PAGE_SIZE });
    };

    const handleMessagesList = (payload: { roomId: string; messages: MessageView[]; hasMore: boolean }) => {
      if (payload.roomId !== roomId) {
        return;
      }

      const isRefresh = isRefreshingLatestRef.current;
      isRefreshingLatestRef.current = false;
      const listed = payload.messages.filter(
        (message) => !pendingHidesRef.current.some((pending) => pending.ids.includes(message.id)),
      );

      if (hasLoadedInitialPageRef.current && !isRefresh) {
        isLoadingOlderRef.current = false;
        setIsLoadingOlder(false);
        clearLoadOlderTimeout();
        const sortedPage = sortMessagesByTimestamp(listed);
        onBeforeOlderMessagesApplied?.();
        setMessages((previous) => {
          const existingIds = new Set(previous.map((message) => message.id));
          const oldest = previous[0];
          const olderPage = oldest
            ? sortedPage.filter((message) => new Date(message.timestamp).getTime() < new Date(oldest.timestamp).getTime())
            : sortedPage;
          const olderMessages = olderPage.slice(-MESSAGES_PAGE_SIZE).filter((message) => !existingIds.has(message.id));
          return olderMessages.length > 0 ? [...olderMessages, ...previous] : previous;
        });
        if (sortedPage.length > 0) {
          socket.emit('message:mark-read', { roomId, messageIds: sortedPage.map((message) => message.id) });
        }
      } else {
        hasLoadedInitialPageRef.current = true;
        const initialMessages = normalizeInitialMessagesPage(listed);
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

      if (!isRefresh) {
        setHasMoreOlder(payload.hasMore);
      }
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
        if (document.visibilityState === 'visible') {
          socket.emit('message:mark-read', { roomId, messageIds: [confirmed.id] });
        } else {
          hasUnreadWhileHiddenRef.current = true;
        }
      }
    };

    const handleSendError = ({ clientTempId, event }: SocketErrorPayload) => {
      if (event === 'message:hide') {
        const [oldest] = pendingHidesRef.current;
        if (oldest) {
          rollbackHide(oldest);
        }
        return;
      }
      if (!clientTempId) {
        return;
      }
      clearPendingTimeout(clientTempId);
      setMessages((previous) =>
        mapChanged(previous, (message) =>
          message.clientTempId === clientTempId ? { ...message, pending: false, failed: true } : message,
        ),
      );
    };

    const handleReadReceipt = ({ roomId: receiptRoomId, userId }: { roomId: string; userId: string }) => {
      if (receiptRoomId !== roomId) {
        return;
      }
      setMessages((previous) =>
        mapChanged(previous, (message) =>
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
      forgetTranslation(deletedRoomId, messageId);
      if (deletedRoomId !== roomId) {
        return;
      }
      setMessages((previous) =>
        mapChanged(previous, (message) =>
          message.id === messageId ? { ...message, deletedForEveryone: true, content: '' } : message,
        ),
      );
    };

    const handleMessageHidden = markPreviewOnlyHandler(({ roomId: hiddenRoomId, messageIds }: MessageHiddenPayload) => {
      for (const messageId of messageIds) {
        forgetTranslation(hiddenRoomId, messageId);
      }
      const hiddenIds = new Set(messageIds);
      const confirmed = pendingHidesRef.current.filter((pending) => pending.ids.every((id) => hiddenIds.has(id)));
      for (const pending of confirmed) {
        clearTimeout(pending.timeoutId);
      }
      pendingHidesRef.current = pendingHidesRef.current.filter((pending) => !confirmed.includes(pending));
      if (hiddenRoomId === roomId) {
        removeWithExit(messageIds);
      }
    });

    const handleMessageUpdated = (updated: MessageView) => {
      if (updated.roomId !== roomId) {
        return;
      }
      setMessages((previous) => mapChanged(previous, (message) => (message.id === updated.id ? updated : message)));
    };

    socket.on('messages:list', handleMessagesList);
    socket.on('user:resumed', refreshLatestPage);
    const unsubscribeRoomKey = subscribeRoomKeyAvailable((availableRoomId) => {
      if (availableRoomId === roomId) {
        refreshLatestPage();
      }
    });
    socket.on('message:new', handleMessageNew);
    socket.on('error', handleSendError);
    socket.on('message:read-receipt', handleReadReceipt);
    socket.on('typing:update', handleTypingUpdate);
    socket.on('recording:update', handleRecordingUpdate);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('message:updated', handleMessageUpdated);
    socket.on('message:hidden', handleMessageHidden);

    return () => {
      socket.off('messages:list', handleMessagesList);
      socket.off('user:resumed', refreshLatestPage);
      unsubscribeRoomKey();
      socket.off('message:new', handleMessageNew);
      socket.off('error', handleSendError);
      socket.off('message:read-receipt', handleReadReceipt);
      socket.off('typing:update', handleTypingUpdate);
      socket.off('recording:update', handleRecordingUpdate);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('message:updated', handleMessageUpdated);
      socket.off('message:hidden', handleMessageHidden);
    };
  }, [socket, roomId, currentUser.id, clearPendingTimeout, onBeforeOlderMessagesApplied, removeWithExit, rollbackHide]);

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
        ...(input.messageId ? { messageId: input.messageId } : {}),
        pending: true,
      };

      if (roomIdRef.current === roomId) {
        setMessages((previous) => [...previous, optimistic]);
        schedulePendingTimeout(clientTempId);
      }

      socket.emit('message:send', {
        roomId,
        content: input.content,
        type: input.type,
        duration: input.duration,
        replyToMessageId: input.replyTo?.id,
        clientTempId,
        messageId: input.messageId,
        fileMeta: input.fileMeta,
        mentionedUserIds: input.mentionedUserIds,
        caption: input.caption,
        linkPreview: input.linkPreview,
        attachmentUrls: linkPreviewAttachmentUrls(input.linkPreview),
      });
    },
    [socket, roomId, currentUser, schedulePendingTimeout],
  );

  const retryMessage = useCallback(
    (clientTempId: string) => {
      const target = messagesRef.current.find((message) => message.clientTempId === clientTempId);
      if (!target || !socket || !isSendableMessageType(target.type)) {
        return;
      }

      setMessages((previous) =>
        mapChanged(previous, (message) =>
          message.clientTempId === clientTempId ? { ...message, pending: true, failed: false } : message,
        ),
      );
      schedulePendingTimeout(clientTempId);

      socket.emit('message:send', {
        roomId: target.roomId,
        content: target.content,
        type: target.type,
        duration: target.duration ?? undefined,
        replyToMessageId: target.replyTo?.id,
        clientTempId,
        messageId: target.messageId,
        fileMeta: target.fileMeta ?? undefined,
        mentionedUserIds: target.mentionedUserIds.length > 0 ? target.mentionedUserIds : undefined,
        caption: target.caption ?? undefined,
        linkPreview: target.linkPreview ?? undefined,
        attachmentUrls: linkPreviewAttachmentUrls(target.linkPreview),
      });
    },
    [socket, schedulePendingTimeout],
  );

  const hideMessages = useCallback(
    (messageIds: string[]) => {
      if (!socket || !roomId || messageIds.length === 0) {
        return;
      }
      setHideFailed(false);
      for (const ids of chunkMessageIds(messageIds)) {
        const idSet = new Set(ids);
        const pending: PendingHide = {
          ids,
          messages: messagesRef.current.filter((message) => idSet.has(message.id)),
          timeoutId: setTimeout(() => rollbackHide(pending), PENDING_TIMEOUT_MS),
        };
        pendingHidesRef.current = [...pendingHidesRef.current, pending];
        socket.emit('message:hide', { messageIds: ids });
      }
      removeWithExit(messageIds);
    },
    [socket, roomId, removeWithExit, rollbackHide],
  );

  const dismissHideFailure = useCallback(() => setHideFailed(false), []);

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
    hideMessages,
    hideFailed,
    dismissHideFailure,
  };
}
