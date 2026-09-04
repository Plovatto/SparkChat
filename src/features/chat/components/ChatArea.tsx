import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { Button } from 'react-bootstrap';
import { FaArrowDown, FaBan, FaComments, FaExclamationTriangle, FaPlay, FaTimes } from 'react-icons/fa';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { Spinner } from '@components/common/Spinner';
import type { User } from '@features/auth';
import type { RoomParticipant, RoomSummary } from '@features/rooms';
import { useTheme } from '@features/theme';
import { formatAudioTime, resolveActiveUserNames } from '@lib/format';
import { getMessageReceipt, type MessageReceiptInfo } from '@lib/message-status';
import { useSocket, type MessageView } from '@lib/socket';
import { uploadChatAudio, uploadChatFile, uploadChatImage } from '../api/chat-api';
import { useReplyVideoThumbnail } from '../hooks/useReplyVideoThumbnail';
import { useRoomMessages } from '../hooks/useRoomMessages';
import type { ChatMessage } from '../types';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { getFileTypeIcon } from '../utils/get-file-type-icon';
import { parseMentionedUserIds } from '../utils/parse-mentions';
import { ChatHeader } from './ChatHeader';
import { EmptyChatState } from './EmptyChatState';
import { ForwardMessageModal } from './ForwardMessageModal';
import { ImageGroupBubble, MessageBubble, type CurrentAudioRef } from './MessageBubble';
import { MessageListSkeleton } from './MessageListSkeleton';
import {
  MessageInput,
  type AudioSendPayload,
  type MessageInputHandle,
  type MessageInputSubmitPayload,
} from './MessageInput';
import { RoomInfoPanel } from './RoomInfoPanel';

interface ChatAreaProps {
  room: RoomSummary | null;
  rooms: RoomSummary[];
  user: User;
  onBack: () => void;
}

const DATE_CHIP_STYLE: CSSProperties = {
  fontSize: '0.78rem',
  color: '#ffffff',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  padding: '5px 14px',
  borderRadius: '999px',
  background: 'rgba(0, 0, 0, 0.55)',
  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.2)',
  transition: 'opacity 0.3s ease',
};

const STICKY_DATE_TOP_PX = 8;
const STICKY_DATE_IDLE_DELAY_MS = 1200;

function applyStuckDateHeaderOpacity(container: HTMLDivElement, stuckKeys: Set<string>, visible: boolean): void {
  const headers = container.querySelectorAll<HTMLElement>('[data-day-sticky]');

  headers.forEach((header) => {
    const key = header.dataset.dayKey;
    if (key && stuckKeys.has(key)) {
      header.style.opacity = visible ? '1' : '0';
    }
  });
}

function formatDateSeparator(timestamp: string): string {
  const date = new Date(timestamp);
  if (isToday(date)) {
    return 'Hoje';
  }
  if (isYesterday(date)) {
    return 'Ontem';
  }
  return format(date, 'dd/MM/yyyy');
}

type RenderItem = { kind: 'single'; message: ChatMessage } | { kind: 'image-group'; messages: ChatMessage[] };

function buildRenderItems(messages: ChatMessage[]): RenderItem[] {
  const items: RenderItem[] = [];
  let buffer: ChatMessage[] = [];

  const flushBuffer = () => {
    if (buffer.length === 0) {
      return;
    }
    if (buffer.length === 1) {
      items.push({ kind: 'single', message: buffer[0]! });
    } else {
      items.push({ kind: 'image-group', messages: buffer });
    }
    buffer = [];
  };

  for (const message of messages) {
    const isGroupable = message.type === 'image' && !message.deletedForEveryone && !message.pending && !message.failed;
    const bufferTail = buffer[buffer.length - 1];

    if (isGroupable && (!bufferTail || (bufferTail.sender.id === message.sender.id && isSameDay(new Date(bufferTail.timestamp), new Date(message.timestamp))))) {
      buffer.push(message);
      continue;
    }

    flushBuffer();

    if (isGroupable) {
      buffer.push(message);
    } else {
      items.push({ kind: 'single', message });
    }
  }
  flushBuffer();

  return items;
}

function renderItemFirstMessage(item: RenderItem): ChatMessage {
  return item.kind === 'single' ? item.message : item.messages[0]!;
}

function renderItemAnchorMessage(item: RenderItem): ChatMessage {
  return item.kind === 'single' ? item.message : item.messages[item.messages.length - 1]!;
}

function renderItemKey(item: RenderItem): string {
  return item.kind === 'single' ? item.message.id : `group-${item.messages[0]!.id}`;
}

interface DayGroup {
  dateLabel: string;
  items: RenderItem[];
}

function buildDayGroups(renderItems: RenderItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let lastDate: Date | null = null;

  for (const item of renderItems) {
    const itemDate = new Date(renderItemFirstMessage(item).timestamp);
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastDate && isSameDay(lastDate, itemDate)) {
      lastGroup.items.push(item);
    } else {
      groups.push({ dateLabel: formatDateSeparator(renderItemFirstMessage(item).timestamp), items: [item] });
    }

    lastDate = itemDate;
  }

  return groups;
}

function receiptKey(receipt: MessageReceiptInfo): string {
  return `${receipt.type}:${receipt.users.map((user) => user.id).sort().join(',')}`;
}

function buildVisibleReceipts(
  items: RenderItem[],
  isGroupChat: boolean,
  participants: RoomParticipant[],
  currentUserId: string | undefined,
): Map<string, MessageReceiptInfo> {
  const candidates = items.reduce<{ key: string; receipt: MessageReceiptInfo }[]>((acc, item) => {
    const anchor = renderItemAnchorMessage(item);
    const receipt = getMessageReceipt(anchor, anchor.sender.id === currentUserId, isGroupChat, participants, currentUserId);
    if (receipt) {
      acc.push({ key: renderItemKey(item), receipt });
    }
    return acc;
  }, []);

  const visible = new Map<string, MessageReceiptInfo>();
  candidates.forEach((candidate, index) => {
    const next = candidates[index + 1];
    if (!next || receiptKey(next.receipt) !== receiptKey(candidate.receipt)) {
      visible.set(candidate.key, candidate.receipt);
    }
  });

  return visible;
}

function getRecordingText(recordingUserIds: string[], participants: RoomParticipant[]): string | null {
  const names = resolveActiveUserNames(recordingUserIds, participants);
  if (names.length === 0) {
    return null;
  }

  if (names.length === 1) {
    return `${names[0]} está gravando áudio...`;
  }

  return `${names.length} pessoas estão gravando áudio...`;
}

function getTypingText(typingUserIds: string[], participants: RoomParticipant[]): string | null {
  const names = resolveActiveUserNames(typingUserIds, participants);
  if (names.length === 0) {
    return null;
  }

  if (names.length === 1) {
    return `${names[0]} está digitando...`;
  }
  if (names.length === 2) {
    return `${names[0]} e ${names[1]} estão digitando...`;
  }
  return 'Várias pessoas estão digitando...';
}

export function ChatArea({ room, rooms, user, onBack }: ChatAreaProps) {
  const { theme, getRoomWallpaper, getRoomAppearance } = useTheme();
  const { socket } = useSocket();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const scrollIdleTimeoutRef = useRef<number | null>(null);
  const stuckDayKeysRef = useRef<Set<string>>(new Set());

  const captureScrollAnchor = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      prependAnchorRef.current = { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop };
    }
  }, []);

  const {
    messages,
    isLoaded: areMessagesLoaded,
    hasMoreOlder,
    isLoadingOlder,
    typingUserIds,
    recordingUserIds,
    sendMessage,
    retryMessage,
    loadOlderMessages,
  } = useRoomMessages(
    room?.id ?? null,
    { id: user.id ?? '', nickname: user.nickname, avatar: user.avatar },
    captureScrollAnchor,
  );
  const { notifyTyping, notifyStoppedTyping } = useTypingIndicator(room?.id ?? null);
  const renderItems = useMemo(() => buildRenderItems(messages), [messages]);
  const dayGroups = useMemo(() => buildDayGroups(renderItems), [renderItems]);
  const visibleReceipts = useMemo(
    () => buildVisibleReceipts(renderItems, room?.type === 'group', room?.participants ?? [], user.id),
    [renderItems, room?.type, room?.participants, user.id],
  );
  const mentionCandidates = useMemo(
    () =>
      room?.type === 'group'
        ? room.participants.filter((participant) => participant.id !== user.id).map((participant) => ({ id: participant.id, nickname: participant.nickname }))
        : undefined,
    [room?.type, room?.participants, user.id],
  );
  const lastMessageIdRef = useRef<string | null>(null);
  const isReadyForLoadMoreRef = useRef(false);
  const hasUserScrolledRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const activityRef = useRef({ typing: false, recording: false });
  const messageInputRef = useRef<MessageInputHandle>(null);
  const currentAudioRef = useRef<CurrentAudioRef | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [scrollButtonPosition, setScrollButtonPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageIdPendingDelete, setMessageIdPendingDelete] = useState<string | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [repliedMessage, setRepliedMessage] = useState<MessageView | null>(null);
  const [uploadingMediaType, setUploadingMediaType] = useState<'image' | 'audio' | 'file' | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const isRepliedMessageVideo = repliedMessage?.type === 'file' && Boolean(repliedMessage.fileMeta?.mimeType.startsWith('video/'));
  const repliedVideoThumbnail = useReplyVideoThumbnail(isRepliedMessageVideo, repliedMessage?.content);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const lastId = lastMessage?.id ?? null;
    if (lastId === lastMessageIdRef.current) {
      return;
    }
    const isInitialPopulation = lastMessageIdRef.current === null;
    lastMessageIdRef.current = lastId;

    const container = scrollContainerRef.current;
    if (!lastId || !container) {
      return;
    }

    if (isInitialPopulation) {
      scrollToBottom();
      isReadyForLoadMoreRef.current = false;
      let secondFrame = 0;
      const firstFrame = requestAnimationFrame(() => {
        scrollToBottom();
        secondFrame = requestAnimationFrame(() => {
          scrollToBottom();
          isReadyForLoadMoreRef.current = true;
        });
      });
      const timeout = window.setTimeout(() => {
        scrollToBottom();
        isReadyForLoadMoreRef.current = true;
      }, 250);
      return () => {
        cancelAnimationFrame(firstFrame);
        cancelAnimationFrame(secondFrame);
        window.clearTimeout(timeout);
      };
    }

    const isOwnMessage = lastMessage?.sender.id === user.id;
    if (isAtBottomRef.current || isOwnMessage) {
      scrollToBottom('smooth');
    }
  }, [messages, scrollToBottom, user.id]);

  useEffect(() => {
    const isTypingNow = typingUserIds.length > 0;
    const isRecordingNow = recordingUserIds.length > 0;
    const previous = activityRef.current;

    if (isAtBottomRef.current && ((isTypingNow && !previous.typing) || (isRecordingNow && !previous.recording))) {
      scrollToBottom('smooth');
    }

    activityRef.current = { typing: isTypingNow, recording: isRecordingNow };
  }, [typingUserIds, recordingUserIds, scrollToBottom]);

  const handleComposerTyping = useCallback(() => {
    notifyTyping();
    if (isAtBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [notifyTyping, scrollToBottom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const updateButtonPosition = () => {
      const rect = container.getBoundingClientRect();
      setScrollButtonPosition({
        top: rect.bottom - 42 - 18,
        left: rect.right - 42 - 18,
      });
    };

    updateButtonPosition();
    window.addEventListener('resize', updateButtonPosition);
    const resizeObserver = new ResizeObserver(updateButtonPosition);
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener('resize', updateButtonPosition);
      resizeObserver.disconnect();
    };
  }, [room?.id, isInfoOpen]);

  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    const container = scrollContainerRef.current;
    if (!anchor || !container) {
      return;
    }
    prependAnchorRef.current = null;

    const applyAnchorCorrection = () => {
      container.scrollTop = anchor.scrollTop + (container.scrollHeight - anchor.scrollHeight);
    };
    applyAnchorCorrection();

    const observer = new ResizeObserver(applyAnchorCorrection);
    if (contentWrapperRef.current) {
      observer.observe(contentWrapperRef.current);
    }
    const settleTimeout = window.setTimeout(() => observer.disconnect(), 800);

    return () => {
      observer.disconnect();
      window.clearTimeout(settleTimeout);
    };
  }, [messages]);

  useEffect(() => {
    isReadyForLoadMoreRef.current = false;
    hasUserScrolledRef.current = false;
    lastMessageIdRef.current = null;
    prependAnchorRef.current = null;
    if (scrollIdleTimeoutRef.current) {
      window.clearTimeout(scrollIdleTimeoutRef.current);
      scrollIdleTimeoutRef.current = null;
    }
    scrollToBottom();
  }, [room?.id, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (scrollIdleTimeoutRef.current) {
        window.clearTimeout(scrollIdleTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    stuckDayKeysRef.current = new Set();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.daySentinel;
          if (!key) {
            continue;
          }
          if (entry.isIntersecting) {
            stuckDayKeysRef.current.delete(key);
          } else {
            stuckDayKeysRef.current.add(key);
          }
        }
      },
      { root: container, rootMargin: `-${STICKY_DATE_TOP_PX + 1}px 0px 0px 0px`, threshold: 0 },
    );

    container.querySelectorAll<HTMLElement>('[data-day-sentinel]').forEach((sentinel) => observer.observe(sentinel));

    return () => observer.disconnect();
  }, [dayGroups]);

  const markUserScrolled = () => {
    hasUserScrolledRef.current = true;
  };

  const handleMessagesScroll = () => {
    const container = scrollContainerRef.current;

    if (container) {
      applyStuckDateHeaderOpacity(container, stuckDayKeysRef.current, true);
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const threshold = isAtBottomRef.current ? 550 : 510;
      const atBottom = distanceFromBottom < threshold;
      if (atBottom !== isAtBottomRef.current) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
      }
    }
    if (scrollIdleTimeoutRef.current) {
      window.clearTimeout(scrollIdleTimeoutRef.current);
    }
    scrollIdleTimeoutRef.current = window.setTimeout(() => {
      if (scrollContainerRef.current) {
        applyStuckDateHeaderOpacity(scrollContainerRef.current, stuckDayKeysRef.current, false);
      }
    }, STICKY_DATE_IDLE_DELAY_MS);

    if (!container || !hasUserScrolledRef.current || !isReadyForLoadMoreRef.current || !hasMoreOlder || isLoadingOlder) {
      return;
    }
    if (container.scrollTop < 150) {
      loadOlderMessages();
    }
  };

  useEffect(() => {
    setIsInfoOpen(false);
    setSelectedMessageId(null);
    setRepliedMessage(null);
    isAtBottomRef.current = true;
    setIsAtBottom(true);
  }, [room?.id]);

  useEffect(() => {
    const handleClickOutside = () => setSelectedMessageId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  if (!room) {
    return <EmptyChatState />;
  }

  const sendImageMessages = async (files: File[], replyTo: MessageView | null) => {
    setUploadingMediaType('image');
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (!file) {
          continue;
        }
        const uploaded = await uploadChatImage(file, { userId: user.id, sessionToken: user.sessionToken }, room.id);
        sendMessage({
          content: uploaded.url,
          type: 'image',
          replyTo: index === 0 ? replyTo : null,
          fileMeta: { name: file.name, mimeType: uploaded.mimeType, size: file.size },
        });
      }
    } catch (error) {
      console.error(error);
      window.alert('Não foi possível enviar uma das imagens. Tente novamente.');
    } finally {
      setUploadingMediaType(null);
    }
  };

  const handleSendAudio = async ({ blob, mimeType, duration }: AudioSendPayload) => {
    setUploadingMediaType('audio');
    try {
      const uploaded = await uploadChatAudio(blob, mimeType, { userId: user.id, sessionToken: user.sessionToken }, room.id);
      sendMessage({
        content: uploaded.url,
        type: 'audio',
        duration,
        replyTo: repliedMessage,
        fileMeta: { name: `audio-${Date.now()}`, mimeType: uploaded.mimeType, size: blob.size },
      });
      setRepliedMessage(null);
    } catch (error) {
      console.error(error);
      window.alert('Não foi possível enviar o áudio. Tente novamente.');
    } finally {
      setUploadingMediaType(null);
    }
  };

  const sendFileMessages = async (files: File[], replyTo: MessageView | null) => {
    setUploadingMediaType('file');
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (!file) {
          continue;
        }
        const uploaded = await uploadChatFile(file, { userId: user.id, sessionToken: user.sessionToken }, room.id);
        sendMessage({
          content: uploaded.url,
          type: 'file',
          replyTo: index === 0 ? replyTo : null,
          fileMeta: { name: uploaded.name, mimeType: uploaded.mimeType, size: uploaded.size },
        });
      }
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : 'Não foi possível enviar um dos arquivos. Tente novamente.');
    } finally {
      setUploadingMediaType(null);
    }
  };

  const handleRecordingStart = () => {
    socket?.emit('recording:start', { roomId: room.id });
  };

  const handleRecordingStop = () => {
    socket?.emit('recording:stop', { roomId: room.id });
  };

  const handleAudioPlayed = (messageId: string) => {
    socket?.emit('audio:played', { messageId });
  };

  const handleSend = ({ text, imageFiles, documentFiles }: MessageInputSubmitPayload) => {
    const trimmed = text.trim();

    if (trimmed) {
      const mentionedUserIds =
        room.type === 'group'
          ? parseMentionedUserIds(
              trimmed,
              room.participants.map((participant) => ({ id: participant.id, nickname: participant.nickname })),
            )
          : undefined;
      sendMessage({ content: trimmed, type: 'text', replyTo: repliedMessage, mentionedUserIds });
    }

    if (imageFiles.length > 0) {
      void sendImageMessages(imageFiles, trimmed ? null : repliedMessage);
    }

    if (documentFiles.length > 0) {
      void sendFileMessages(documentFiles, trimmed || imageFiles.length > 0 ? null : repliedMessage);
    }

    setRepliedMessage(null);
    notifyStoppedTyping();
  };

  const handleReply = (message: MessageView) => {
    setRepliedMessage(message);
    setSelectedMessageId(message.id);
    setTimeout(() => messageInputRef.current?.focus(), 100);
  };

  const handleForward = (message: ChatMessage) => {
    setForwardingMessage(message);
  };

  const handleLeftGroup = () => {
    setIsInfoOpen(false);
    onBack();
  };

  const wallpaper = getRoomWallpaper(room.id);
  const appearance = getRoomAppearance(room.id);
  const wallpaperBackground = wallpaper?.background
    ? wallpaper.isImage
      ? `${wallpaper.background} center/cover`
      : wallpaper.background
    : theme.background;
  const showOverlay = Boolean(wallpaper?.isImage) && appearance.overlayOpacity > 0;

  const confirmDeleteMessage = () => {
    if (messageIdPendingDelete) {
      socket?.emit('message:delete', { messageId: messageIdPendingDelete });
    }
    setSelectedMessageId(null);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDraggingFile(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    messageInputRef.current?.addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.background }}>
      <ChatHeader room={room} currentUserId={user.id} onBack={onBack} onOpenInfo={() => setIsInfoOpen(true)} />
      <RoomInfoPanel
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        room={room}
        currentUserId={user.id}
        messages={messages}
        messagesLoaded={areMessagesLoaded}
        onLeftGroup={handleLeftGroup}
      />

      <div
        style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div style={{ position: 'absolute', inset: 0, background: wallpaperBackground }} />
        {isDraggingFile && (
          <div
            style={{
              position: 'absolute',
              inset: '8px',
              zIndex: 20,
              background: `${theme.primary}26`,
              border: `3px dashed ${theme.primary}`,
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                background: theme.surface,
                color: theme.text,
                padding: '14px 22px',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '0.95rem',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
              }}
            >
              Solte o arquivo aqui
            </div>
          </div>
        )}
        {showOverlay && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `rgba(0, 0, 0, ${appearance.overlayOpacity / 100})`,
              backdropFilter: appearance.overlayBlur > 0 ? `blur(${appearance.overlayBlur}px)` : undefined,
              WebkitBackdropFilter: appearance.overlayBlur > 0 ? `blur(${appearance.overlayBlur}px)` : undefined,
            }}
          />
        )}
        <div
          ref={scrollContainerRef}
          onScroll={handleMessagesScroll}
          onWheel={markUserScrolled}
          onTouchMove={markUserScrolled}
          data-chat-messages
          className="chat-messages-scroll"
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
        <div ref={contentWrapperRef} style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
        {!areMessagesLoaded ? (
          <MessageListSkeleton />
        ) : messages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '300px',
              color: theme.textSecondary,
              fontSize: '1.1rem',
              fontWeight: 500,
              gap: '12px',
            }}
          >
            <FaComments size={40} style={{ opacity: 0.5 }} />
            <div>Nenhuma mensagem ainda</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>Comece a conversa enviando uma mensagem!</div>
          </div>
        ) : (
          <>
            {isLoadingOlder && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 2px' }}>
                <Spinner size={20} />
              </div>
            )}
            {dayGroups.map((group) => {
              const dayKey = `day-${renderItemKey(group.items[0]!)}`;

              return (
              <div key={dayKey} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div data-day-sentinel={dayKey} style={{ height: 0 }} />
                <div
                  style={{
                    position: 'sticky',
                    top: `${STICKY_DATE_TOP_PX}px`,
                    zIndex: 5,
                    display: 'flex',
                    justifyContent: 'center',
                    margin: '15px 0',
                    pointerEvents: 'none',
                  }}
                >
                  <span data-day-sticky data-day-key={dayKey} style={DATE_CHIP_STYLE}>
                    {group.dateLabel}
                  </span>
                </div>

                {group.items.map((item) => {
                  const anchorMessage = renderItemAnchorMessage(item);
                  const isOwn = anchorMessage.sender.id === user.id;

                  return (
                    <div key={renderItemKey(item)} style={{ width: '100%', display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                      {item.kind === 'single' ? (
                        <MessageBubble
                          message={item.message}
                          isOwn={isOwn}
                          isGroupChat={room.type === 'group'}
                          roomId={room.id}
                          participants={room.participants}
                          currentUserId={user.id}
                          currentNickname={user.nickname}
                          isSelected={selectedMessageId === item.message.id}
                          currentAudioRef={currentAudioRef}
                          receipt={visibleReceipts.get(renderItemKey(item)) ?? null}
                          onSelect={() => setSelectedMessageId(item.message.id)}
                          onReply={() => handleReply(item.message)}
                          onDelete={() => setMessageIdPendingDelete(item.message.id)}
                          onForward={() => handleForward(item.message)}
                          onAudioPlayed={handleAudioPlayed}
                          onRetry={() => item.message.clientTempId && retryMessage(item.message.clientTempId)}
                        />
                      ) : (
                        <ImageGroupBubble
                          images={item.messages}
                          isOwn={isOwn}
                          isGroupChat={room.type === 'group'}
                          roomId={room.id}
                          participants={room.participants}
                          currentUserId={user.id}
                          isSelected={selectedMessageId === anchorMessage.id}
                          receipt={visibleReceipts.get(renderItemKey(item)) ?? null}
                          onSelect={() => setSelectedMessageId(anchorMessage.id)}
                          onReply={() => handleReply(anchorMessage)}
                          onDelete={() => setMessageIdPendingDelete(anchorMessage.id)}
                          onForward={() => handleForward(anchorMessage)}
                          onRetry={() => anchorMessage.clientTempId && retryMessage(anchorMessage.clientTempId)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              );
            })}
          </>
        )}

        {(() => {
          const recordingText = getRecordingText(recordingUserIds, room.participants);
          if (!recordingText) {
            return null;
          }

          return (
            <div
              className="animate__animated animate__fadeInUp animate__faster"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 15px',
                background: theme.surface,
                borderRadius: '15px',
                width: 'fit-content',
                maxWidth: '100%',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '100%',
                  background: theme.primary,
                  animation: 'blink 1s infinite',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '0.85rem', color: theme.textSecondary, fontStyle: 'italic', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {recordingText}
              </span>
            </div>
          );
        })()}

        {(() => {
          const typingText = getTypingText(typingUserIds, room.participants);
          if (!typingText) {
            return null;
          }

          return (
            <div
              className="animate__animated animate__fadeInUp animate__faster"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 15px',
                background: theme.surface,
                borderRadius: '15px',
                width: 'fit-content',
                maxWidth: '100%',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            >
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    style={{
                      width: '8px',
                      height: '8px',
                      background: theme.primary,
                      borderRadius: '50%',
                      animation: 'typing 1.4s infinite',
                      animationDelay: `${index * 0.2}s`,
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: '0.85rem', color: theme.textSecondary, fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                {typingText}
              </span>
            </div>
          );
        })()}

        {uploadingMediaType && (
          <div
            className="animate__animated animate__fadeInUp animate__faster"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 15px',
              background: theme.surface,
              borderRadius: '15px',
              maxWidth: '220px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <Spinner size={16} />
            <span style={{ fontSize: '0.85rem', color: theme.textSecondary, fontStyle: 'italic' }}>
              {uploadingMediaType === 'image'
                ? 'Enviando imagem...'
                : uploadingMediaType === 'audio'
                  ? 'Enviando áudio...'
                  : 'Enviando arquivo...'}
            </span>
          </div>
        )}
        </div>
        <button
          onClick={() => {
            isAtBottomRef.current = true;
            setIsAtBottom(true);
            scrollToBottom('smooth');
          }}
          title="Ir para a última mensagem"
          aria-hidden={isAtBottom}
          tabIndex={isAtBottom ? -1 : 0}
          style={{
            position: 'fixed',
            top: scrollButtonPosition?.top ?? 0,
            left: scrollButtonPosition?.left ?? 0,
            visibility: scrollButtonPosition ? 'visible' : 'hidden',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            border: 'none',
            background: theme.surface,
            color: theme.primary,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 5,
            opacity: isAtBottom ? 0 : 1,
            transform: isAtBottom ? 'scale(0.85)' : 'scale(1)',
            pointerEvents: isAtBottom ? 'none' : 'auto',
            transition: 'opacity 0.18s ease, transform 0.18s ease',
          }}
        >
          <FaArrowDown size={16} />
        </button>
        </div>
      </div>

      {room.userBlocked && (
        <div
          style={{
            background: '#fff3e0',
            color: '#e65100',
            padding: '12px 18px',
            borderTop: '2px solid #ff9800',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
          }}
        >
          <FaBan size={16} />
          <strong>Você bloqueou este usuário</strong>
        </div>
      )}

      {room.isBlockedBy && (
        <div
          style={{
            background: '#ffebee',
            color: '#c62828',
            padding: '12px 18px',
            borderTop: '2px solid #d32f2f',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
          }}
        >
          <FaExclamationTriangle size={16} />
          <strong>Você foi bloqueado por este usuário</strong>
        </div>
      )}

      {repliedMessage && (
        <div
          className="chat-preview-bar"
          style={{
            background: theme.surfaceLight,
            borderLeft: `4px solid ${theme.primary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.textSecondary, marginBottom: '4px' }}>
              Respondendo {repliedMessage.sender.id === user.id ? 'a você mesmo' : `a ${repliedMessage.sender.nickname}`}
            </div>
            <div
              style={{
                fontSize: '0.9rem',
                color: theme.text,
                maxWidth: '300px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflow: 'hidden',
              }}
            >
              {repliedMessage.type === 'image' ? (
                <img
                  src={repliedMessage.content}
                  alt="thumb"
                  style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                />
              ) : repliedMessage.type === 'audio' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <FaPlay size={12} />
                  <span>Áudio {formatAudioTime(repliedMessage.duration ?? 0)}</span>
                </div>
              ) : repliedMessage.type === 'file' ? (
                isRepliedMessageVideo ? (
                  <img
                    src={repliedVideoThumbnail ?? undefined}
                    alt="thumb"
                    style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'rgba(0, 0, 0, 0.15)' }}
                  />
                ) : (
                  (() => {
                    const fileIcon = getFileTypeIcon(repliedMessage.fileMeta?.mimeType ?? '');
                    const FileIcon = fileIcon.icon;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <FileIcon size={14} color={fileIcon.color} style={{ flexShrink: 0 }} />
                        <span style={{ display: 'inline-block', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {repliedMessage.fileMeta?.name ?? fileIcon.label}
                        </span>
                      </div>
                    );
                  })()
                )
              ) : (
                <span style={{ display: 'inline-block', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {repliedMessage.content}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="link"
            onClick={() => setRepliedMessage(null)}
            style={{ color: theme.textSecondary, padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center' }}
          >
            <FaTimes size={14} />
          </Button>
        </div>
      )}

      <MessageInput
        ref={messageInputRef}
        onSend={handleSend}
        onSendAudio={(payload) => void handleSendAudio(payload)}
        onTyping={handleComposerTyping}
        onRecordingStart={handleRecordingStart}
        onRecordingStop={handleRecordingStop}
        isBlockedBy={room.isBlockedBy}
        userBlocked={room.userBlocked}
        mentionCandidates={mentionCandidates}
      />

      <ConfirmDialog
        isOpen={messageIdPendingDelete !== null}
        title="Deletar mensagem"
        message="Tem certeza que deseja deletar esta mensagem para todos?"
        onConfirm={confirmDeleteMessage}
        onCancel={() => setMessageIdPendingDelete(null)}
        theme={theme}
      />

      <ForwardMessageModal
        isOpen={forwardingMessage !== null}
        onClose={() => setForwardingMessage(null)}
        rooms={rooms}
        currentUserId={user.id}
        message={forwardingMessage}
      />
    </div>
  );
}
