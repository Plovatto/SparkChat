import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { isSameDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { FaArrowDown, FaBan, FaComments, FaExclamationTriangle } from 'react-icons/fa';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { Spinner } from '@components/common/Spinner';
import type { User } from '@features/auth';
import { MOTION_DURATION_MS, useEntranceGate, usePresence } from '@features/motion';
import { useTheme } from '@features/theme';
import { translateError } from '@lib/api/api-error';
import { MissingRoomKeyError } from '@lib/e2ee';
import { formatDayLabel, resolveActiveUserNames } from '@lib/format';
import { translate, useAppLanguage } from '@lib/i18n/app-i18n';
import { oppositeLanguage } from '@lib/i18n/language';
import { getMessageReceipt, type MessageReceiptInfo } from '@lib/message-status';
import { useSocket, type MessageView, type RoomParticipant, type RoomSummary } from '@lib/socket';
import { isTranslationSupportedOnDevice, prepareTranslationOnGesture } from '@lib/translation';
import { isGifMimeType } from '@lib/media/media-type';
import { uploadChatAudio, uploadChatFile, uploadChatGif, uploadChatImage, uploadLinkPreviewImage, type UploadedFile } from '../api/chat-api';
import { RoomTranslationContext, type RoomTranslation } from '../hooks/room-translation-context';
import { useAutoTranslateSuggestion } from '../hooks/useAutoTranslateSuggestion';
import { useRoomMessages } from '../hooks/useRoomMessages';
import { useRoomTranslationPreferences } from '../hooks/useRoomTranslationPreferences';
import type { ChatMessage } from '../types';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { ASSISTANT_MAX_TEXT_CHARS, isAssistantRoom } from '../utils/assistant';
import { shouldShowAutoTranslateBanner } from '../utils/auto-translate-suggestion';
import { finalizeComposerLinkPreview } from '../utils/composer-link-preview';
import type { TranslationMode } from '../utils/message-translation';
import { parseMentionedUserIds } from '../utils/parse-mentions';
import type { CurrentAudioRef } from './AudioMessageContent';
import { AutoTranslateBanner } from './AutoTranslateBanner';
import { ChatHeader } from './ChatHeader';
import { CallStatusBar } from '@features/calls';
import { ContactKeyBanner } from './ContactKeyBanner';
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
  fontWeight: 600,
  whiteSpace: 'nowrap',
  padding: '5px 14px',
  borderRadius: '999px',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  transition: 'opacity var(--sc-dur-slow) var(--sc-ease-standard)',
};

const STICKY_DATE_TOP_PX = 8;
const FILL_VIEWPORT_CHECK_DELAY_MS = 350;
const STICKY_DATE_IDLE_DELAY_MS = 1200;
const ENTRANCE_CASCADE_MAX_INDEX = 7;

function uploadErrorText(error: unknown, fallbackKey: string): string {
  return error instanceof MissingRoomKeyError ? translate('errors.e2ee.missingRoomKey') : translateError(error, fallbackKey);
}

const ATTACHMENT_UPLOAD_ERROR_KEY: Record<AttachmentMessageType, string> = {
  image: 'chat.upload.someImageFailed',
  file: 'chat.upload.someFileFailed',
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

type ImageGroup = [ChatMessage, ChatMessage, ...ChatMessage[]];
type RenderItem = { kind: 'single'; message: ChatMessage } | { kind: 'image-group'; messages: ImageGroup };

function isImageGroup(messages: ChatMessage[]): messages is ImageGroup {
  return messages.length >= 2;
}

function isSameMessageList(left: ChatMessage[], right: ChatMessage[]): boolean {
  return left.length === right.length && left.every((message, index) => message === right[index]);
}

function buildRenderItems(messages: ChatMessage[], previousGroups: Map<string, ImageGroup>): RenderItem[] {
  const items: RenderItem[] = [];
  let buffer: ChatMessage[] = [];

  const flushBuffer = () => {
    const [first] = buffer;
    if (!first) {
      return;
    }
    if (isImageGroup(buffer)) {
      const previous = previousGroups.get(first.id);
      items.push({ kind: 'image-group', messages: previous && isSameMessageList(previous, buffer) ? previous : buffer });
    } else {
      items.push({ kind: 'single', message: first });
    }
    buffer = [];
  };

  for (const message of messages) {
    const isGroupable =
      message.type === 'image' &&
      !message.deletedForEveryone &&
      !message.pending &&
      !message.failed &&
      !message.caption &&
      !isGifMimeType(message.fileMeta?.mimeType);
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
  timestamp: string;
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
      groups.push({ timestamp: renderItemFirstMessage(item).timestamp, items: [item] });
    }

    lastDate = itemDate;
  }

  return groups;
}

function receiptKey(receipt: MessageReceiptInfo): string {
  return `${receipt.type}:${receipt.users.map((user) => user.id).sort().join(',')}`;
}

function isSameReceipt(left: MessageReceiptInfo, right: MessageReceiptInfo): boolean {
  return left.type === right.type && left.users.length === right.users.length && left.users.every((user, index) => user === right.users[index]);
}

function buildVisibleReceipts(
  items: RenderItem[],
  isGroupChat: boolean,
  participants: RoomParticipant[],
  currentUserId: string | undefined,
  previous: Map<string, MessageReceiptInfo>,
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
      const prior = previous.get(candidate.key);
      visible.set(candidate.key, prior && isSameReceipt(prior, candidate.receipt) ? prior : candidate.receipt);
    }
  });

  return visible;
}

function getRecordingText(recordingUserIds: string[], participants: RoomParticipant[]): string | null {
  const names = resolveActiveUserNames(recordingUserIds, participants);
  if (names.length === 0) {
    return null;
  }

  return translate('chat.recording', { count: names.length, name: names[0] });
}

function getTypingText(typingUserIds: string[], participants: RoomParticipant[]): string | null {
  const names = resolveActiveUserNames(typingUserIds, participants);
  if (names.length === 0) {
    return null;
  }

  if (names.length === 1) {
    return translate('chat.typingOne', { name: names[0] });
  }
  if (names.length === 2) {
    return translate('chat.typingTwo', { first: names[0], second: names[1] });
  }
  return translate('chat.typingMany');
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
      className="sc-anim-rise-in"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 15px',
        background: theme.surfaceElevated,
        border: `1px solid ${theme.borderSubtle}`,
        borderRadius: '15px',
        width: 'fit-content',
        maxWidth,
        boxShadow: theme.shadowSm,
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
  tone: 'warning' | 'danger';
  icon: ReactNode;
  text: string;
}

function BlockedBanner({ tone, icon, text }: BlockedBannerProps) {
  const { theme } = useTheme();
  const background = tone === 'warning' ? theme.warningSoft : theme.dangerSoft;
  const color = tone === 'warning' ? theme.warningText : theme.dangerText;
  const borderColor = tone === 'warning' ? theme.warning : theme.danger;

  return (
    <div
      className="sc-anim-rise-in"
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
  const { t } = useTranslation();
  const { theme, getRoomWallpaper, getRoomAppearance } = useTheme();
  const { socket } = useSocket();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const scrollIdleTimeoutRef = useRef<number | null>(null);
  const stuckDayKeysRef = useRef<Set<string>>(new Set());
  const imageGroupsRef = useRef<Map<string, ImageGroup>>(new Map());
  const visibleReceiptsRef = useRef<Map<string, MessageReceiptInfo>>(new Map());
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
    reactToMessage,
  } = useRoomMessages(room?.id ?? null, { id: user.id, nickname: user.nickname, avatar: user.avatar }, captureScrollAnchor);
  const { notifyTyping, notifyStoppedTyping } = useTypingIndicator(room?.id ?? null);
  const { getEntrancePhase, suspendEntrance } = useEntranceGate(areMessagesLoaded, room?.id ?? null);
  const lastRepliedMessageRef = useRef<MessageView | null>(null);
  const renderItems = useMemo(() => {
    const items = buildRenderItems(messages, imageGroupsRef.current);
    const groups = new Map<string, ImageGroup>();
    for (const item of items) {
      if (item.kind === 'image-group') {
        groups.set(item.messages[0].id, item.messages);
      }
    }
    imageGroupsRef.current = groups;
    return items;
  }, [messages]);
  const entranceIndexByKey = useMemo(() => {
    const lastIndex = renderItems.length - 1;
    return new Map(renderItems.map((item, index) => [renderItemKey(item), Math.min(lastIndex - index, ENTRANCE_CASCADE_MAX_INDEX)]));
  }, [renderItems]);
  const dayGroups = useMemo(() => buildDayGroups(renderItems), [renderItems]);
  const dayKeysSignature = useMemo(() => dayGroups.map((group) => renderItemKey(group.items[0])).join('|'), [dayGroups]);
  const isGroupChat = room?.type === 'group';
  const participants = room?.participants;
  const visibleReceipts = useMemo(() => {
    const next = buildVisibleReceipts(renderItems, isGroupChat, participants ?? [], user.id, visibleReceiptsRef.current);
    visibleReceiptsRef.current = next;
    return next;
  }, [renderItems, isGroupChat, participants, user.id]);
  const mentionCandidates = useMemo(
    () =>
      isGroupChat && participants
        ? participants.filter((participant) => participant.id !== user.id).map((participant) => ({ id: participant.id, nickname: participant.nickname }))
        : undefined,
    [isGroupChat, participants, user.id],
  );
  const lastMessageIdRef = useRef<string | null>(null);
  const isReadyForLoadMoreRef = useRef(false);
  const uploadsInFlightRef = useRef(0);
  const uploadGenerationRef = useRef(0);
  const recordingRoomIdRef = useRef<string | null>(null);
  const hasUserScrolledRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const activityRef = useRef({ typing: false, recording: false });
  const messageInputRef = useRef<MessageInputHandle>(null);
  const currentAudioRef = useRef<CurrentAudioRef | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [scrollButtonPosition, setScrollButtonPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageIdsPendingDelete, setMessageIdsPendingDelete] = useState<string[] | null>(null);
  const [forwardingMessages, setForwardingMessages] = useState<ChatMessage[] | null>(null);
  const [repliedMessage, setRepliedMessage] = useState<MessageView | null>(null);
  const [uploadingMediaType, setUploadingMediaType] = useState<AttachmentMessageType | 'audio' | 'gif' | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const replyPresence = usePresence(repliedMessage !== null, MOTION_DURATION_MS.fast);

  useLayoutEffect(() => {
    if (!selectedMessageId) {
      return;
    }
    const container = scrollContainerRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-message-root="${selectedMessageId}"]`);
    if (!container || !target) {
      return;
    }

    const EDGE_PADDING_PX = 12;
    const SETTLE_DURATION_MS = 360;

    const applyVisibilityCorrection = () => {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      if (targetRect.bottom > containerRect.bottom) {
        container.scrollTop += targetRect.bottom - containerRect.bottom + EDGE_PADDING_PX;
      } else if (targetRect.top < containerRect.top) {
        container.scrollTop -= containerRect.top - targetRect.top + EDGE_PADDING_PX;
      }
    };

    applyVisibilityCorrection();

    const startedAt = performance.now();
    let frameId: number;
    const trackSettlingLayout = (now: number) => {
      applyVisibilityCorrection();
      if (now - startedAt < SETTLE_DURATION_MS) {
        frameId = requestAnimationFrame(trackSettlingLayout);
      }
    };
    frameId = requestAnimationFrame(trackSettlingLayout);

    return () => cancelAnimationFrame(frameId);
  }, [selectedMessageId]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    const keepPinnedToBottom = () => {
      if (isAtBottomRef.current) {
        scrollToBottom();
      }
    };

    viewport.addEventListener('resize', keepPinnedToBottom);
    return () => viewport.removeEventListener('resize', keepPinnedToBottom);
  }, [scrollToBottom]);

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
  }, [dayKeysSignature]);

  useEffect(() => {
    if (!areMessagesLoaded || !hasMoreOlder || isLoadingOlder) {
      return;
    }
    const timer = window.setTimeout(() => {
      const container = scrollContainerRef.current;
      if (container && isReadyForLoadMoreRef.current && container.scrollHeight <= container.clientHeight + 1) {
        loadOlderMessages();
      }
    }, FILL_VIEWPORT_CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [areMessagesLoaded, hasMoreOlder, isLoadingOlder, messages.length, loadOlderMessages]);

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
      suspendEntrance();
      loadOlderMessages();
    }
  };

  useEffect(() => {
    setIsInfoOpen(false);
    setSelectedMessageId(null);
    setRepliedMessage(null);
    setUploadingMediaType(null);
    uploadsInFlightRef.current = 0;
    uploadGenerationRef.current += 1;
    isAtBottomRef.current = true;
    setIsAtBottom(true);
  }, [room?.id]);

  useEffect(
    () => () => {
      const recordingRoomId = recordingRoomIdRef.current;
      recordingRoomIdRef.current = null;
      if (recordingRoomId) {
        socket?.emit('recording:stop', { roomId: recordingRoomId });
      }
    },
    [room?.id, socket],
  );

  useEffect(() => {
    const preventFileNavigation = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault();
      }
    };
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setSelectedMessageId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const toggleSelectedMessage = useCallback((messageId: string) => {
    setSelectedMessageId((current) => (current === messageId ? null : messageId));
  }, []);

  const openMessageActions = useCallback((messageId: string) => {
    setSelectedMessageId(messageId);
  }, []);

  const handleReply = useCallback((message: MessageView) => {
    setRepliedMessage(message);
    setSelectedMessageId(message.id);
    setTimeout(() => messageInputRef.current?.focus(), 100);
  }, []);

  const handleDeleteRequest = useCallback((messageIds: string[]) => {
    setMessageIdsPendingDelete(messageIds);
  }, []);

  const handleForward = useCallback((messagesToForward: ChatMessage[]) => {
    setForwardingMessages(messagesToForward);
  }, []);

  const handleAudioPlayed = useCallback(
    (messageId: string) => {
      socket?.emit('audio:played', { messageId });
    },
    [socket],
  );

  const { language: appLanguage } = useAppLanguage();
  const [translationSupported] = useState(isTranslationSupportedOnDevice);
  const { autoRoomIds, dismissedRoomIds, setAutoTranslate, dismissSuggestion } = useRoomTranslationPreferences(user.id);
  const roomIds = useMemo(() => rooms.map((candidate) => candidate.id), [rooms]);
  const suggestion = useAutoTranslateSuggestion(room?.id ?? null, roomIds);
  const translationMode: TranslationMode =
    !room || !translationSupported || isAssistantRoom(room) ? 'off' : autoRoomIds.has(room.id) ? 'auto' : 'manual';
  const { reportAssessment, reportManualTranslation } = suggestion;
  const roomTranslation = useMemo<RoomTranslation>(
    () => ({ mode: translationMode, reportAssessment, reportManualTranslation }),
    [translationMode, reportAssessment, reportManualTranslation],
  );

  const changeAutoTranslate = useCallback(
    (roomId: string, enabled: boolean) => {
      if (enabled) {
        prepareTranslationOnGesture(appLanguage);
      }
      setAutoTranslate(roomId, enabled);
    },
    [appLanguage, setAutoTranslate],
  );

  if (!room) {
    return <EmptyChatState />;
  }

  const showTranslationSuggestion = shouldShowAutoTranslateBanner({
    mode: translationMode,
    dismissed: dismissedRoomIds.has(room.id),
    triggered: suggestion.triggered,
  });

  const beginUpload = (type: AttachmentMessageType | 'audio' | 'gif'): number => {
    uploadsInFlightRef.current += 1;
    setUploadingMediaType(type);
    return uploadGenerationRef.current;
  };

  const endUpload = (generation: number) => {
    if (generation !== uploadGenerationRef.current) {
      return;
    }
    uploadsInFlightRef.current = Math.max(0, uploadsInFlightRef.current - 1);
    if (uploadsInFlightRef.current === 0) {
      setUploadingMediaType(null);
    }
  };

  const sendAttachmentMessages = async (
    files: File[],
    type: AttachmentMessageType,
    replyTo: MessageView | null,
    caption?: string,
    captionMentionedUserIds?: string[],
  ) => {
    const targetRoomId = room.id;
    let isFirstSent = true;
    let lastError: unknown = null;
    const uploadGeneration = beginUpload(type);
    for (const file of files) {
      try {
        const target = { roomId: targetRoomId, messageId: crypto.randomUUID() };
        const uploaded: UploadedFile =
          type === 'image'
            ? { ...(await uploadChatImage(file, auth, target)), name: file.name, size: file.size }
            : await uploadChatFile(file, auth, target);
        sendMessage({
          messageId: target.messageId,
          content: uploaded.url,
          type,
          replyTo: isFirstSent ? replyTo : null,
          caption: isFirstSent ? caption : undefined,
          mentionedUserIds: isFirstSent ? captionMentionedUserIds : undefined,
          fileMeta: {
            name: uploaded.name,
            mimeType: uploaded.mimeType,
            size: uploaded.size,
            key: uploaded.key,
            ...(uploaded.thumbnailUrl && uploaded.thumbnailKey ? { thumbnailUrl: uploaded.thumbnailUrl, thumbnailKey: uploaded.thumbnailKey } : {}),
          },
        });
        isFirstSent = false;
      } catch (error) {
        console.error(error);
        lastError = error;
      }
    }
    endUpload(uploadGeneration);
    if (lastError) {
      window.alert(uploadErrorText(lastError, ATTACHMENT_UPLOAD_ERROR_KEY[type]));
    }
  };

  const handleSendAudio = async ({ blob, mimeType, duration, pending }: AudioSendPayload) => {
    const audioReplyTo = pending ? null : repliedMessage;
    if (pending) {
      await sendPayload(pending);
    }
    const audioUploadGeneration = beginUpload('audio');
    try {
      const messageId = crypto.randomUUID();
      const uploaded = await uploadChatAudio(blob, mimeType, auth, { roomId: room.id, messageId });
      sendMessage({
        messageId,
        content: uploaded.url,
        type: 'audio',
        duration,
        replyTo: audioReplyTo,
        fileMeta: { name: `audio-${Date.now()}`, mimeType: uploaded.mimeType, size: blob.size, key: uploaded.key },
      });
      setRepliedMessage((current) => (current && audioReplyTo && current.id === audioReplyTo.id ? null : current));
    } catch (error) {
      console.error(error);
      window.alert(uploadErrorText(error, 'chat.upload.audioRetry'));
    } finally {
      endUpload(audioUploadGeneration);
    }
  };

  const handleSendGif = async (blob: Blob) => {
    const gifReplyTo = repliedMessage;
    const gifUploadGeneration = beginUpload('gif');
    try {
      const messageId = crypto.randomUUID();
      const uploaded = await uploadChatGif(blob, auth, { roomId: room.id, messageId });
      sendMessage({
        messageId,
        content: uploaded.url,
        type: 'image',
        replyTo: gifReplyTo,
        fileMeta: { name: uploaded.name, mimeType: uploaded.mimeType, size: uploaded.size, key: uploaded.key },
      });
      setRepliedMessage((current) => (current && gifReplyTo && current.id === gifReplyTo.id ? null : current));
    } catch (error) {
      console.error(error);
      window.alert(uploadErrorText(error, 'chat.upload.gifFailed'));
    } finally {
      endUpload(gifUploadGeneration);
    }
  };

  const handleRecordingStart = () => {
    recordingRoomIdRef.current = room.id;
    socket?.emit('recording:start', { roomId: room.id });
  };

  const handleRecordingStop = () => {
    const recordingRoomId = recordingRoomIdRef.current;
    recordingRoomIdRef.current = null;
    if (recordingRoomId) {
      socket?.emit('recording:stop', { roomId: recordingRoomId });
    }
  };

  const sendPayload = async ({ text, imageFiles, documentFiles, linkPreview }: MessageInputSubmitPayload): Promise<void> => {
    const trimmed = text.trim();
    const hasAttachments = imageFiles.length > 0 || documentFiles.length > 0;
    const mentionedUserIds =
      room.type === 'group' && trimmed
        ? parseMentionedUserIds(
            trimmed,
            room.participants.map((participant) => ({ id: participant.id, nickname: participant.nickname })),
          )
        : undefined;

    const caption = hasAttachments && trimmed ? trimmed : undefined;
    const uploads: Promise<void>[] = [];

    if (trimmed && !hasAttachments) {
      const textReplyTo = repliedMessage;
      const targetRoomId = room.id;
      if (linkPreview?.image) {
        const messageId = crypto.randomUUID();
        uploads.push(
          finalizeComposerLinkPreview(linkPreview, (image) => uploadLinkPreviewImage(image, auth, { roomId: targetRoomId, messageId })).then(
            (outgoing) => {
              sendMessage({
                messageId,
                content: trimmed,
                type: 'text',
                replyTo: textReplyTo,
                mentionedUserIds,
                linkPreview: outgoing.linkPreview,
                fileMeta: outgoing.fileMeta,
              });
            },
          ),
        );
      } else {
        sendMessage({ content: trimmed, type: 'text', replyTo: textReplyTo, mentionedUserIds, linkPreview: linkPreview?.preview });
      }
    }

    if (imageFiles.length > 0) {
      uploads.push(sendAttachmentMessages(imageFiles, 'image', repliedMessage, caption, mentionedUserIds));
    }

    if (documentFiles.length > 0) {
      const hasImages = imageFiles.length > 0;
      uploads.push(
        sendAttachmentMessages(documentFiles, 'file', hasImages ? null : repliedMessage, hasImages ? undefined : caption, hasImages ? undefined : mentionedUserIds),
      );
    }

    setRepliedMessage(null);
    notifyStoppedTyping();
    await Promise.all(uploads);
  };

  const handleSend = (payload: MessageInputSubmitPayload) => {
    void sendPayload(payload);
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
    : theme.canvas;
  const showOverlay = Boolean(wallpaper?.isImage) && appearance.overlayOpacity > 0;

  const confirmDeleteMessage = () => {
    for (const messageId of messageIdsPendingDelete ?? []) {
      socket?.emit('message:delete', { messageId });
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

  if (repliedMessage) {
    lastRepliedMessageRef.current = repliedMessage;
  }
  const replyPreviewMessage = repliedMessage ?? lastRepliedMessageRef.current;

  const content = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.canvas }}>
      <ChatHeader key={room.id} room={room} currentUserId={user.id} onBack={onBack} onOpenInfo={() => setIsInfoOpen(true)} />
      <CallStatusBar />
      <ContactKeyBanner key={`${room.id}-key-trust`} room={room} currentUserId={user.id} />
      <RoomInfoPanel
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        room={room}
        currentUserId={user.id}
        messages={messages}
        messagesLoaded={areMessagesLoaded}
        onLeftGroup={handleLeftGroup}
        autoTranslate={
          translationMode === 'off'
            ? undefined
            : {
                enabled: translationMode === 'auto',
                onChange: (enabled) => {
                  changeAutoTranslate(room.id, enabled);
                  dismissSuggestion(room.id);
                },
              }
        }
      />

      <div aria-live="polite" className="sc-sr-only">
        {showTranslationSuggestion ? t('chat.translation.suggestTitle', { language: t(`chat.translation.languages.${oppositeLanguage(appLanguage)}`) }) : ''}
      </div>
      {showTranslationSuggestion && (
        <AutoTranslateBanner
          language={oppositeLanguage(appLanguage)}
          onAccept={() => {
            changeAutoTranslate(room.id, true);
            dismissSuggestion(room.id);
          }}
          onDismiss={() => dismissSuggestion(room.id)}
        />
      )}

      <div
        style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div style={{ position: 'absolute', inset: 0, background: wallpaperBackground }} />
        {isDraggingFile && (
          <div
            className="sc-drop-zone sc-anim-fade-in"
            style={{
              position: 'absolute',
              inset: '8px',
              zIndex: 20,
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              className="sc-anim-pop-in"
              style={{
                background: theme.surfaceElevated,
                color: theme.accentText,
                padding: '14px 22px',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '0.95rem',
                boxShadow: theme.shadowMd,
                border: `1px solid ${theme.accent}`,
              }}
            >
              {t('chat.dropFile')}
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
          onPointerDown={markUserScrolled}
          onKeyDown={markUserScrolled}
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
                <FaComments size={40} className="animate-float" style={{ color: theme.accentText, opacity: 0.6 }} />
                <div className="sc-anim-rise-in sc-stagger" style={{ '--sc-stagger-index': 1 } as CSSProperties}>
                  {t('chat.noMessages')}
                </div>
                <div
                  className="sc-anim-rise-in sc-stagger"
                  style={{ fontSize: '0.9rem', color: theme.textMuted, '--sc-stagger-index': 2 } as CSSProperties}
                >
                  {t('chat.startConversation')}
                </div>
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
                        <span
                          data-day-sticky
                          data-day-key={dayKey}
                          style={{ ...DATE_CHIP_STYLE, background: theme.dateChip, color: theme.dateChipText, boxShadow: theme.shadowSm }}
                        >
                          {formatDayLabel(group.timestamp)}
                        </span>
                      </div>

                      {group.items.map((item) => {
                        const anchorMessage = renderItemAnchorMessage(item);
                        const isOwn = anchorMessage.sender.id === user.id;
                        const itemKey = renderItemKey(item);
                        const entrancePhase = getEntrancePhase();
                        const entranceIndex = entrancePhase === 'initial' ? (entranceIndexByKey.get(itemKey) ?? 0) : 0;

                        return (
                          <div key={itemKey} style={{ width: '100%', display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                            {item.kind === 'single' ? (
                              <MessageBubble
                                message={item.message}
                                isOwn={isOwn}
                                isGroupChat={isGroupChat}
                                roomId={room.id}
                                isAssistantRoom={isAssistantRoom(room)}
                                participants={room.participants}
                                currentUserId={user.id}
                                currentNickname={user.nickname}
                                isSelected={selectedMessageId === item.message.id}
                                currentAudioRef={currentAudioRef}
                                receipt={visibleReceipts.get(itemKey) ?? null}
                                onSelect={toggleSelectedMessage}
                                onOpenActions={openMessageActions}
                                onReply={handleReply}
                                onDelete={handleDeleteRequest}
                                onForward={handleForward}
                                onAudioPlayed={handleAudioPlayed}
                                onRetry={retryMessage}
                                onReact={reactToMessage}
                                entrancePhase={entrancePhase}
                                entranceIndex={entranceIndex}
                              />
                            ) : (
                              <ImageGroupBubble
                                images={item.messages}
                                isOwn={isOwn}
                                isGroupChat={isGroupChat}
                                roomId={room.id}
                                participants={room.participants}
                                currentUserId={user.id}
                                isSelected={selectedMessageId === anchorMessage.id}
                                receipt={visibleReceipts.get(itemKey) ?? null}
                                onSelect={toggleSelectedMessage}
                                onOpenActions={openMessageActions}
                                onReply={handleReply}
                                onDelete={handleDeleteRequest}
                                onForward={handleForward}
                                onRetry={retryMessage}
                                onReact={reactToMessage}
                                entrancePhase={entrancePhase}
                                entranceIndex={entranceIndex}
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
                    className="sc-anim-blink"
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '100%',
                      background: theme.accent,
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
                        className="sc-anim-typing-dot"
                        style={
                          {
                            width: '8px',
                            height: '8px',
                            background: theme.accent,
                            borderRadius: '50%',
                            '--sc-anim-delay': `${index * 150}ms`,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </div>
                }
                text={typingText}
              />
            )}

            {uploadingMediaType && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <ChatStatusPill indicator={<Spinner size={16} />} text={t(`chat.uploading.${uploadingMediaType}`)} maxWidth="220px" />
              </div>
            )}
          </div>
          <button
            onClick={() => {
              isAtBottomRef.current = true;
              setIsAtBottom(true);
              scrollToBottom('smooth');
            }}
            title={t('chat.scrollToLatest')}
            aria-hidden={isAtBottom}
            tabIndex={isAtBottom ? -1 : 0}
            className="sc-icon-btn sc-icon-btn--surface"
            style={{
              position: 'fixed',
              top: scrollButtonPosition?.top ?? 0,
              left: scrollButtonPosition?.left ?? 0,
              visibility: scrollButtonPosition ? 'visible' : 'hidden',
              width: '42px',
              height: '42px',
              border: `1px solid ${theme.border}`,
              zIndex: 5,
              opacity: isAtBottom ? 0 : 1,
              transform: isAtBottom ? 'translateY(10px) scale(0.7)' : undefined,
              pointerEvents: isAtBottom ? 'none' : 'auto',
            }}
          >
            <FaArrowDown size={16} />
          </button>
        </div>
      </div>

      {room.userBlocked && (
        <BlockedBanner tone="warning" icon={<FaBan size={16} />} text={t('chat.youBlocked')} />
      )}

      {room.isBlockedBy && (
        <BlockedBanner tone="danger" icon={<FaExclamationTriangle size={16} />} text={t('chat.blockedYou')} />
      )}

      {replyPresence.isPresent && replyPreviewMessage && (
        <ReplyPreviewBar
          key={replyPreviewMessage.id}
          message={replyPreviewMessage}
          currentUserId={user.id}
          isExiting={replyPresence.isExiting}
          onCancel={() => setRepliedMessage(null)}
        />
      )}

      <MessageInput
        key={`input-${room.id}`}
        ref={messageInputRef}
        onSend={handleSend}
        onSendAudio={(payload) => void handleSendAudio(payload)}
        onSendGif={isAssistantRoom(room) ? undefined : (blob) => void handleSendGif(blob)}
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
        isOpen={messageIdsPendingDelete !== null}
        title={t('chat.deleteTitle', { count: messageIdsPendingDelete?.length ?? 1 })}
        message={t('chat.deleteConfirm', { count: messageIdsPendingDelete?.length ?? 1 })}
        onConfirm={confirmDeleteMessage}
        onCancel={() => setMessageIdsPendingDelete(null)}
      />

      <ForwardMessageModal
        isOpen={forwardingMessages !== null}
        onClose={() => setForwardingMessages(null)}
        rooms={rooms}
        currentUserId={user.id}
        messages={forwardingMessages ?? []}
        auth={auth}
      />
    </div>
  );

  return <RoomTranslationContext.Provider value={roomTranslation}>{content}</RoomTranslationContext.Provider>;
}
