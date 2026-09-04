import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { FaArrowDown, FaBan, FaComments, FaExclamationTriangle } from 'react-icons/fa';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { Spinner } from '@components/common/Spinner';
import type { User } from '@features/auth';
import { useTheme } from '@features/theme';
import { resolveActiveUserNames } from '@lib/format';
import { getMessageReceipt, type MessageReceiptInfo } from '@lib/message-status';
import { useSocket, type MessageView, type RoomParticipant, type RoomSummary } from '@lib/socket';
import { uploadChatAudio, uploadChatFile, uploadChatImage, type UploadedFile } from '../api/chat-api';
import { useRoomMessages } from '../hooks/useRoomMessages';
import type { ChatMessage } from '../types';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { ASSISTANT_MAX_TEXT_CHARS, isAssistantRoom } from '../utils/assistant';
import { parseMentionedUserIds } from '../utils/parse-mentions';
import type { CurrentAudioRef } from './AudioMessageContent';
import { ChatHeader } from './ChatHeader';
import { EmptyChatState } from './EmptyChatState';
import { ForwardMessageModal } from './ForwardMessageModal';
import { ImageGroupBubble } from './ImageGroupBubble';
import { MessageBubble } from './MessageBubble';
import { MessageListSkeleton } from './MessageListSkeleton';
import {
  MessageInput,
  type AudioSendPayload,
  type MessageInputHandle,
  type MessageInputSubmitPayload,
} from './MessageInput';
import { ReplyPreviewBar } from './ReplyPreviewBar';
import { RoomInfoPanel } from './RoomInfoPanel';

interface ChatAreaProps {
  room: RoomSummary | null;
  rooms: RoomSummary[];
  user: User;
  onBack: () => void;
}

type AttachmentMessageType = 'image' | 'file';

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

const UPLOADING_LABEL: Record<AttachmentMessageType | 'audio', string> = {
  image: 'Enviando imagem...',
  audio: 'Enviando áudio...',
  file: 'Enviando arquivo...',
};

const ATTACHMENT_UPLOAD_ERROR: Record<AttachmentMessageType, string> = {
  image: 'Não foi possível enviar uma das imagens. Tente novamente.',
  file: 'Não foi possível enviar um dos arquivos. Tente novamente.',
};

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

type ImageGroup = [ChatMessage, ChatMessage, ...ChatMessage[]];
type RenderItem = { kind: 'single'; message: ChatMessage } | { kind: 'image-group'; messages: ImageGroup };

function isImageGroup(messages: ChatMessage[]): messages is ImageGroup {
  return messages.length >= 2;
}

function buildRenderItems(messages: ChatMessage[]): RenderItem[] {
  const items: RenderItem[] = [];
  let buffer: ChatMessage[] = [];

  const flushBuffer = () => {
    const [first] = buffer;
    if (!first) {
      return;
    }
    if (isImageGroup(buffer)) {
      items.push({ kind: 'image-group', messages: buffer });
    } else {
      items.push({ kind: 'single', message: first });
    }
    buffer = [];
  };

  for (const message of messages) {
    const isGroupable =
      message.type === 'image' && !message.deletedForEveryone && !message.pending && !message.failed && !message.caption;
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
  return item.kind === 'single' ? item.message : item.messages[0];
}

function renderItemAnchorMessage(item: RenderItem): ChatMessage {
  return item.kind === 'single' ? item.message : (item.messages[item.messages.length - 1] ?? item.messages[0]);
}

function renderItemKey(item: RenderItem): string {
  return item.kind === 'single' ? item.message.id : `group-${item.messages[0].id}`;
}

interface DayGroup {
  dateLabel: string;
  items: [RenderItem, ...RenderItem[]];
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

interface ChatStatusPillProps {
  indicator: ReactNode;
  text: string;
  italicWeight?: number;
  maxWidth?: string;
}

function ChatStatusPill({ indicator, text, italicWeight, maxWidth = '100%' }: ChatStatusPillProps) {
  const { theme } = useTheme();

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
        maxWidth,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      {indicator}
      <span style={{ fontSize: '0.85rem', color: theme.textSecondary, fontStyle: 'italic', fontWeight: italicWeight, whiteSpace: 'nowrap' }}>
        {text}
      </span>
    </div>
  );
}

interface BlockedBannerProps {
  background: string;
  color: string;
  borderColor: string;
  icon: ReactNode;
  text: string;
}

function BlockedBanner({ background, color, borderColor, icon, text }: BlockedBannerProps) {
  return (
    <div
      style={{
        background,
        color,
        padding: '12px 18px',
        borderTop: `2px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '0.9rem',
      }}
    >
      {icon}
      <strong>{text}</strong>
    </div>
  );
}

export function ChatArea({ room, rooms, user, onBack }: ChatAreaProps) {
  const { theme, getRoomWallpaper, getRoomAppearance } = useTheme();
  const { socket } = useSocket();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const scrollIdleTimeoutRef = useRef<number | null>(null);
  const stuckDayKeysRef = useRef<Set<string>>(new Set());
  const auth = useMemo(() => ({ userId: user.id, sessionToken: user.sessionToken }), [user.id, user.sessionToken]);

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
  } = useRoomMessages(room?.id ?? null, { id: user.id, nickname: user.nickname, avatar: user.avatar }, captureScrollAnchor);
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
  const [uploadingMediaType, setUploadingMediaType] = useState<AttachmentMessageType | 'audio' | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

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

  const sendAttachmentMessages = async (files: File[], type: AttachmentMessageType, replyTo: MessageView | null, caption?: string) => {
    setUploadingMediaType(type);
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (!file) {
          continue;
        }
        const uploaded: UploadedFile =
          type === 'image'
            ? { ...(await uploadChatImage(file, auth, room.id)), name: file.name, size: file.size }
            : await uploadChatFile(file, auth, room.id);
        sendMessage({
          content: uploaded.url,
          type,
          replyTo: index === 0 ? replyTo : null,
          caption: index === 0 ? caption : undefined,
          fileMeta: { name: uploaded.name, mimeType: uploaded.mimeType, size: uploaded.size },
        });
      }
    } catch (error) {
      console.error(error);
      window.alert(type === 'file' && error instanceof Error ? error.message : ATTACHMENT_UPLOAD_ERROR[type]);
    } finally {
      setUploadingMediaType(null);
    }
  };

  const handleSendAudio = async ({ blob, mimeType, duration }: AudioSendPayload) => {
    setUploadingMediaType('audio');
    try {
      const uploaded = await uploadChatAudio(blob, mimeType, auth, room.id);
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

  const handleRecordingStart = () => {
    socket?.emit('recording:start', { roomId: room.id });
  };

  const handleRecordingStop = () => {
    socket?.emit('recording:stop', { roomId: room.id });
  };

  const handleAudioPlayed = (messageId: string) => {
    socket?.emit('audio:played', { messageId });
  };

  const handleSend = ({ text, imageFiles, documentFiles, linkPreview }: MessageInputSubmitPayload) => {
    const trimmed = text.trim();
    const hasAttachments = imageFiles.length > 0 || documentFiles.length > 0;

    if (trimmed && !hasAttachments) {
      const mentionedUserIds =
        room.type === 'group'
          ? parseMentionedUserIds(
              trimmed,
              room.participants.map((participant) => ({ id: participant.id, nickname: participant.nickname })),
            )
          : undefined;
      sendMessage({ content: trimmed, type: 'text', replyTo: repliedMessage, mentionedUserIds, linkPreview });
    }

    const caption = hasAttachments && trimmed ? trimmed : undefined;

    if (imageFiles.length > 0) {
      void sendAttachmentMessages(imageFiles, 'image', repliedMessage, caption);
    }

    if (documentFiles.length > 0) {
      const hasImages = imageFiles.length > 0;
      void sendAttachmentMessages(documentFiles, 'file', hasImages ? null : repliedMessage, hasImages ? undefined : caption);
    }

    setRepliedMessage(null);
    notifyStoppedTyping();
  };

  const handleReply = (message: MessageView) => {
    setRepliedMessage(message);
    setSelectedMessageId(message.id);
    setTimeout(() => messageInputRef.current?.focus(), 100);
  };

  const handleLeftGroup = () => {
    setIsInfoOpen(false);
    onBack();
  };

  const toggleSelectedMessage = (messageId: string) => {
    setSelectedMessageId((current) => (current === messageId ? null : messageId));
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

  const recordingText = getRecordingText(recordingUserIds, room.participants);
  const typingText = getTypingText(typingUserIds, room.participants);

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
                  const dayKey = `day-${renderItemKey(group.items[0])}`;

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
                        const itemKey = renderItemKey(item);

                        return (
                          <div key={itemKey} style={{ width: '100%', display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                            {item.kind === 'single' ? (
                              <MessageBubble
                                message={item.message}
                                isOwn={isOwn}
                                isGroupChat={room.type === 'group'}
                                roomId={room.id}
                                participants={room.participants}
                                currentUserId={user.id}
                                currentNickname={user.nickname}
                                auth={auth}
                                isSelected={selectedMessageId === item.message.id}
                                currentAudioRef={currentAudioRef}
                                receipt={visibleReceipts.get(itemKey) ?? null}
                                onSelect={() => toggleSelectedMessage(item.message.id)}
                                onReply={() => handleReply(item.message)}
                                onDelete={() => setMessageIdPendingDelete(item.message.id)}
                                onForward={() => setForwardingMessage(item.message)}
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
                                receipt={visibleReceipts.get(itemKey) ?? null}
                                onSelect={() => toggleSelectedMessage(anchorMessage.id)}
                                onReply={() => handleReply(anchorMessage)}
                                onDelete={() => setMessageIdPendingDelete(anchorMessage.id)}
                                onForward={() => setForwardingMessage(anchorMessage)}
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

            {recordingText && (
              <ChatStatusPill
                indicator={
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
                }
                text={recordingText}
                italicWeight={500}
              />
            )}

            {typingText && (
              <ChatStatusPill
                indicator={
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
                }
                text={typingText}
              />
            )}

            {uploadingMediaType && <ChatStatusPill indicator={<Spinner size={16} />} text={UPLOADING_LABEL[uploadingMediaType]} maxWidth="220px" />}
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
        <BlockedBanner background="#fff3e0" color="#e65100" borderColor="#ff9800" icon={<FaBan size={16} />} text="Você bloqueou este usuário" />
      )}

      {room.isBlockedBy && (
        <BlockedBanner
          background="#ffebee"
          color="#c62828"
          borderColor="#d32f2f"
          icon={<FaExclamationTriangle size={16} />}
          text="Você foi bloqueado por este usuário"
        />
      )}

      {repliedMessage && <ReplyPreviewBar message={repliedMessage} currentUserId={user.id} onCancel={() => setRepliedMessage(null)} />}

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
        maxLength={isAssistantRoom(room) ? ASSISTANT_MAX_TEXT_CHARS : undefined}
        auth={auth}
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
