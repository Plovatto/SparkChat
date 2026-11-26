import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuickReply, QuickReplyChoice } from '@lib/assistant/assistant-card';
import { MOTION_DURATION_MS } from '@features/motion';
import { isEncryptedMediaUrl, subscribeRoomKeyAvailable } from '@lib/e2ee';
import { translateErrorPayload } from '@lib/api/api-error';
import { translate } from '@lib/i18n/app-i18n';
import { forgetTranslation } from '@lib/translation';
import {
  markPreviewOnlyHandler,
  useSocket,
  type MessageFileMeta,
  type MessageHiddenPayload,
  type MessageLinkPreview,
  type MessageReaction,
  type MessageReactionsUpdatedPayload,
  type MessageReplySnapshot,
  type MessageType,
  type MessageView,
  type SocketErrorPayload,
} from '@lib/socket';
import type { ChatMessage } from '../types';
import { chunkMessageIds } from '../utils/delete-options';
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
  quickReply?: QuickReply;
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
  hideFailure: HideFailure | null;
  dismissHideFailure: () => void;
  reactToMessage: (messageId: string, emoji: string | null) => void;
  reactionFailure: string;
}

export interface HideFailure {
  code: string | null;
}

interface PendingHide {
  ids: string[];
  messages: ChatMessage[];
  timeoutId: ReturnType<typeof setTimeout>;
}

interface PendingReaction {
  emoji: string | null;
  baseline: MessageReaction[];
  updatedAt: string;
  timeoutId: ReturnType<typeof setTimeout>;
}

const PENDING_TIMEOUT_MS = 10000;
const MESSAGE_EXIT_MS = MOTION_DURATION_MS.normal;
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

function timeOf(message: { timestamp: string }): number {
  return new Date(message.timestamp).getTime();
}

function restoreMessages(messages: ChatMessage[], restored: ChatMessage[]): ChatMessage[] {
  const restoredById = new Map(restored.map((message) => [message.id, message]));
  const settled = mapChanged(messages, (message) => (restoredById.has(message.id) && message.exiting ? { ...message, exiting: false } : message));
  const presentIds = new Set(settled.map((message) => message.id));
  const missing = restored.filter((message) => !presentIds.has(message.id)).map((message) => ({ ...message, exiting: false }));
  if (missing.length === 0) {
    return settled;
  }
  return [...settled, ...missing].sort((left, right) => timeOf(left) - timeOf(right));
}

function markDeletedForEveryone(message: ChatMessage): ChatMessage {
  return { ...message, deletedForEveryone: true, content: '', fileMeta: null, caption: null, linkPreview: null, replyTo: null, reactions: [] };
}

function mergeReloadedPage(previous: ChatMessage[], page: ChatMessage[], hasMore: boolean): ChatMessage[] {
  const pageIds = new Set(page.map((message) => message.id));
  const oldest = page[0];
  const newest = page[page.length - 1];
  const kept = previous.filter((message) => {
    if (pageIds.has(message.id)) {
      return false;
    }
    if (message.pending || message.failed) {
      return true;
    }
    if (!oldest || !newest) {
      return hasMore;
    }
    const time = timeOf(message);
    return time < timeOf(oldest) || time > timeOf(newest);
  });
  return [...page, ...kept].sort((left, right) => timeOf(left) - timeOf(right));
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
  const [hideFailure, setHideFailure] = useState<HideFailure | null>(null);

  const updatePendingSnapshots = useCallback((messageId: string, update: (message: ChatMessage) => ChatMessage) => {
    for (const pending of pendingHidesRef.current) {
      pending.messages = pending.messages.map((message) => (message.id === messageId ? update(message) : message));
    }
  }, []);

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

  const rollbackHide = useCallback((pending: PendingHide, code: string | null = null) => {
    clearTimeout(pending.timeoutId);
    pendingHidesRef.current = pendingHidesRef.current.filter((candidate) => candidate !== pending);
    setHideFailure({ code });
    if (pending.messages.length === 0 || pending.messages[0]?.roomId !== roomIdRef.current) {
      return;
    }
    setMessages((previous) => restoreMessages(previous, pending.messages));
  }, []);

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
    for (const pending of pendingHidesRef.current) {
      clearTimeout(pending.timeoutId);
    }
    pendingHidesRef.current = [];
    for (const timeoutId of exitTimeoutsRef.current) {
      clearTimeout(timeoutId);
    }
    exitTimeoutsRef.current.clear();
    setHideFailure(null);
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
        setMessages((previous) => (previous.length === 0 ? initialMessages : mergeReloadedPage(previous, initialMessages, payload.hasMore)));
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
          return previous.map((existing) =>
            existing.clientTempId === clientTempId ? { ...confirmed, renderKey: existing.renderKey ?? existing.id } : existing,
          );
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
      const { clientTempId, event, code, messageId, messageIds } = payload;
      if (event === REACT_EVENT && messageId) {
        rollbackReaction(messageId, code ? translateErrorPayload(payload, REACTION_FAILED_KEY) : translate(REACTION_FAILED_KEY));
        return;
      }
      if (event === 'message:hide') {
        const pendingHides = pendingHidesRef.current;
        const target = messageIds
          ? pendingHides.find((pending) => pending.ids.length === messageIds.length && pending.ids.every((id) => messageIds.includes(id)))
          : pendingHides[pendingHides.length - 1];
        if (target) {
          rollbackHide(target, code ?? null);
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
      updatePendingSnapshots(messageId, markDeletedForEveryone);
      settlePendingReaction(messageId);
      setMessages((previous) =>
        mapChanged(previous, (message) =>
          message.id === messageId ? { ...message, deletedForEveryone: true, content: '', reactions: [] } : message,
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
        for (const messageId of messageIds) {
          settlePendingReaction(messageId);
        }
        removeWithExit(messageIds);
      }
    });

    const handleMessageUpdated = (updated: MessageView) => {
      if (updated.roomId !== roomId) {
        return;
      }
      const current = messagesRef.current.find((message) => message.id === updated.id);
      const reactions = overlayPendingReaction(updated.id, updated.reactions ?? current?.reactions ?? []);
      const resolvedChoice = updated.resolvedChoice ?? current?.resolvedChoice;
      const resolved = {
        ...(resolvedChoice ? { resolvedChoice } : {}),
        ...(!updated.card && current?.card ? { card: current.card } : {}),
      };
      updatePendingSnapshots(updated.id, (message) => ({ ...updated, ...resolved, reactions, exiting: message.exiting }));
      setMessages((previous) =>
        mapChanged(previous, (message) =>
          message.id === updated.id ? { ...updated, ...resolved, reactions, ...(message.exiting ? { exiting: true } : {}) } : message,
        ),
      );
    };

    const handleCardResolved = ({ roomId: resolvedRoomId, cardId, choice }: { roomId: string; cardId: string; choice: QuickReplyChoice }) => {
      if (resolvedRoomId !== roomId) {
        return;
      }
      setMessages((previous) =>
        mapChanged(previous, (message) => (message.id === cardId ? { ...message, resolvedChoice: choice } : message)),
      );
    };

    const handleReactionsUpdated = (payload: MessageReactionsUpdatedPayload) => {
      if (payload.roomId !== roomId) {
        return;
      }
      const reactions = overlayPendingReaction(payload.messageId, payload.reactions);
      updatePendingSnapshots(payload.messageId, (message) => ({ ...message, reactions }));
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
    socket.on('message:hidden', handleMessageHidden);
    socket.on('message:reactions-updated', handleReactionsUpdated);
    socket.on('message:card-resolved', handleCardResolved);

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
      socket.off('message:reactions-updated', handleReactionsUpdated);
      socket.off('message:card-resolved', handleCardResolved);
    };
  }, [
    socket,
    roomId,
    currentUser.id,
    clearPendingTimeout,
    onBeforeOlderMessagesApplied,
    removeWithExit,
    rollbackHide,
    updatePendingSnapshots,
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
        ...(input.quickReply ? { quickReply: input.quickReply } : {}),
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
        quickReply: input.quickReply,
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
        quickReply: target.quickReply,
      });
    },
    [socket, schedulePendingTimeout],
  );

  const hideMessages = useCallback(
    (messageIds: string[]) => {
      if (!socket || !roomId || messageIds.length === 0) {
        return;
      }
      setHideFailure(null);
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

  const dismissHideFailure = useCallback(() => setHideFailure(null), []);

  const reactToMessage = useCallback(
    (messageId: string, emoji: string | null) => {
      const target = messagesRef.current.find((message) => message.id === messageId);
      if (!socket || !roomId || !target || target.roomId !== roomId || target.exiting || !canReactToMessage(target)) {
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
    hideMessages,
    hideFailure,
    dismissHideFailure,
    reactToMessage,
    reactionFailure,
  };
}
