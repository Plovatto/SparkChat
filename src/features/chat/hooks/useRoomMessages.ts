import { useCallback, useEffect, useRef, useState } from 'react';
import { isEncryptedMediaUrl, subscribeRoomKeyAvailable } from '@lib/e2ee';
import { translateErrorPayload } from '@lib/api/api-error';
import { translate } from '@lib/i18n/app-i18n';
import { forgetTranslation } from '@lib/translation';
import {
  useSocket,
  type MessageFileMeta,
  type MessageLinkPreview,
  type MessageReaction,
  type MessageReactionsUpdatedPayload,
  type MessageReplySnapshot,
  type MessageType,
  type MessageView,
  type SocketErrorPayload,
} from '@lib/socket';
import type { ChatMessage } from '../types';
import { applyOwnReaction, canReactToMessage } from '../utils/reactions';

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
  reactToMessage: (messageId: string, emoji: string | null) => void;
  reactionFailure: string;
}

interface PendingReaction {
  emoji: string | null;
  baseline: MessageReaction[];
  updatedAt: string;
  timeoutId: ReturnType<typeof setTimeout>;
}

const PENDING_TIMEOUT_MS = 10000;
const REACTION_TIMEOUT_MS = 10000;
const REACTION_FAILURE_VISIBLE_MS = 4500;
const REACTION_FAILED_KEY = 'chat.reactions.failed';
const REACT_EVENT = 'message:react';
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
  const pendingReactionsRef = useRef(new Map<string, PendingReaction>());
  const [reactionFailure, setReactionFailure] = useState('');

  useEffect(() => {
    if (!reactionFailure) {
      return;
    }
    const timer = setTimeout(() => setReactionFailure(''), REACTION_FAILURE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [reactionFailure]);

  const clearPendingReactions = useCallback(() => {
    for (const pending of pendingReactionsRef.current.values()) {
      clearTimeout(pending.timeoutId);
    }
    pendingReactionsRef.current.clear();
  }, []);

  const settlePendingReaction = useCallback((messageId: string) => {
    const pending = pendingReactionsRef.current.get(messageId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pendingReactionsRef.current.delete(messageId);
    }
    return pending;
  }, []);

  const rollbackReaction = useCallback(
    (messageId: string, reason?: string) => {
      const pending = settlePendingReaction(messageId);
      if (!pending) {
        return;
      }
      setReactionFailure(reason ?? translate(REACTION_FAILED_KEY));
      setMessages((previous) =>
        mapChanged(previous, (message) => (message.id === messageId ? { ...message, reactions: pending.baseline } : message)),
      );
    },
    [settlePendingReaction],
  );

  const overlayPendingReaction = useCallback(
    (messageId: string, reactions: MessageReaction[]): MessageReaction[] => {
      const pending = pendingReactionsRef.current.get(messageId);
      if (!pending) {
        return reactions;
      }
      const own = reactions.find((reaction) => reaction.userId === currentUser.id)?.emoji ?? null;
      if (own === pending.emoji) {
        settlePendingReaction(messageId);
        return reactions;
      }
      pending.baseline = reactions;
      return applyOwnReaction(reactions, currentUser.id, pending.emoji, pending.updatedAt);
    },
    [currentUser.id, settlePendingReaction],
  );

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
    setReactionFailure('');
    for (const timeoutId of pendingTimeoutsRef.current.values()) {
      clearTimeout(timeoutId);
    }
    pendingTimeoutsRef.current.clear();
    clearPendingReactions();
  }, [roomId, clearPendingReactions]);

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

      if (hasLoadedInitialPageRef.current && !isRefresh) {
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
          return olderMessages.length > 0 ? [...olderMessages, ...previous] : previous;
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

    const handleSendError = (payload: SocketErrorPayload) => {
      const { clientTempId, event, messageId } = payload;
      if (event === REACT_EVENT && messageId) {
        rollbackReaction(messageId, payload.code ? translateErrorPayload(payload, REACTION_FAILED_KEY) : translate(REACTION_FAILED_KEY));
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
      settlePendingReaction(messageId);
      setMessages((previous) =>
        mapChanged(previous, (message) =>
          message.id === messageId ? { ...message, deletedForEveryone: true, content: '', reactions: [] } : message,
        ),
      );
    };

    const handleMessageUpdated = (updated: MessageView) => {
      if (updated.roomId !== roomId) {
        return;
      }
      const current = messagesRef.current.find((message) => message.id === updated.id);
      const reactions = overlayPendingReaction(updated.id, updated.reactions ?? current?.reactions ?? []);
      setMessages((previous) => mapChanged(previous, (message) => (message.id === updated.id ? { ...updated, reactions } : message)));
    };

    const handleReactionsUpdated = (payload: MessageReactionsUpdatedPayload) => {
      if (payload.roomId !== roomId) {
        return;
      }
      const reactions = overlayPendingReaction(payload.messageId, payload.reactions);
      setMessages((previous) =>
        mapChanged(previous, (message) => (message.id === payload.messageId ? { ...message, reactions } : message)),
      );
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
    socket.on('message:reactions-updated', handleReactionsUpdated);

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
      socket.off('message:reactions-updated', handleReactionsUpdated);
    };
  }, [
    socket,
    roomId,
    currentUser.id,
    clearPendingTimeout,
    onBeforeOlderMessagesApplied,
    rollbackReaction,
    settlePendingReaction,
    overlayPendingReaction,
  ]);

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

  const reactToMessage = useCallback(
    (messageId: string, emoji: string | null) => {
      const target = messagesRef.current.find((message) => message.id === messageId);
      if (!socket || !roomId || !target || target.roomId !== roomId || !canReactToMessage(target)) {
        return;
      }

      const previous = pendingReactionsRef.current.get(messageId);
      const baseline = previous?.baseline ?? target.reactions ?? [];
      if (previous) {
        clearTimeout(previous.timeoutId);
      }
      const updatedAt = new Date().toISOString();
      const timeoutId = setTimeout(() => rollbackReaction(messageId), REACTION_TIMEOUT_MS);
      pendingReactionsRef.current.set(messageId, { emoji, baseline, updatedAt, timeoutId });

      setMessages((current) =>
        mapChanged(current, (message) =>
          message.id === messageId ? { ...message, reactions: applyOwnReaction(baseline, currentUser.id, emoji, updatedAt) } : message,
        ),
      );
      socket.emit('message:react', { roomId, messageId, emoji });
    },
    [socket, roomId, currentUser.id, rollbackReaction],
  );

  useEffect(() => clearPendingReactions, [clearPendingReactions]);

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
    reactToMessage,
    reactionFailure,
  };
}
