import { memo, useContext, useRef, useState, type CSSProperties, type RefObject, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MOTION_DURATION_MS, usePresence, type EntrancePhase } from '@features/motion';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import { useInViewport } from '@hooks/useInViewport';
import type { SessionAuth } from '@lib/api/session-auth';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { getMessageStatus, type MessageReceiptInfo } from '@lib/message-status';
import type { RoomParticipant } from '@lib/socket';
import { AutoTranslateContext } from '../hooks/useAutoTranslatePreference';
import { useMessageTranslation } from '../hooks/useMessageTranslation';
import type { ChatMessage } from '../types';
import { localizeAssistantWelcome } from '../utils/assistant-welcome';
import { removeFirstUrl } from '../utils/extract-first-url';
import { getFileTypeIcon } from '../utils/get-file-type-icon';
import { truncateLongText } from '../utils/truncate-long-text';
import { AudioMessageContent, type CurrentAudioRef } from './AudioMessageContent';
import { FileMessageContent } from './FileMessageContent';
import { ImageMessageContent } from './ImageMessageContent';
import { LinkPreviewCard } from './LinkPreviewCard';
import { MessageActionsRow } from './MessageActionsRow';
import { MessageBubbleShell } from './MessageBubbleShell';
import { MessageMeta } from './MessageMeta';
import { MessageReceiptRow } from './MessageReceiptRow';
import { MessageReplyQuote } from './MessageReplyQuote';
import { DeletedMessageBubble, ErrorMessageBubble, SystemMessageBubble } from './SpecialMessageBubbles';
import { TranslationBadge } from './TranslationBadge';
import { VideoMessageContent } from './VideoMessageContent';

export interface MessageBubbleActions {
  onSelect: (messageId: string) => void;
  onOpenActions: (messageId: string) => void;
  onReply: (message: ChatMessage) => void;
  onDelete: (messageIds: string[]) => void;
  onForward: (messages: ChatMessage[]) => void;
  onRetry: (clientTempId: string) => void;
}

interface MessageBubbleProps extends MessageBubbleActions {
  message: ChatMessage;
  isOwn: boolean;
  isGroupChat: boolean;
  roomId: string;
  /** The SparkAI room: no translation, and its welcome is shown in the current language. */
  isAssistantRoom?: boolean;
  participants: RoomParticipant[];
  currentUserId: string | undefined;
  currentNickname: string;
  auth: SessionAuth;
  isSelected: boolean;
  currentAudioRef: RefObject<CurrentAudioRef | null>;
  receipt: MessageReceiptInfo | null;
  onAudioPlayed: (messageId: string) => void;
  entrancePhase?: EntrancePhase;
  entranceIndex?: number;
}

const LINK_PREVIEW_BUBBLE_WIDTH = 300;
const MENTION_TOKEN_PATTERN = /(@[\p{L}\p{N}_]+)/gu;

const MEDIA_CAPTION_STYLE: CSSProperties = { padding: '4px 12px 0', width: 0, minWidth: '100%', boxSizing: 'border-box' };

const MESSAGE_TEXT_STYLE: CSSProperties = {
  margin: 0,
  fontSize: '0.95rem',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  fontWeight: 500,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
};

function renderMessageContent(text: string, participants: RoomParticipant[], accentColor: string): ReactNode {
  if (participants.length === 0 || !text.includes('@')) {
    return text;
  }

  const nicknames = new Set(participants.map((participant) => participant.nickname.toLowerCase()));

  return text.split(MENTION_TOKEN_PATTERN).map((part, index) => {
    if (part.startsWith('@') && nicknames.has(part.slice(1).toLowerCase())) {
      return (
        <span key={index} style={{ fontWeight: 700, color: accentColor }}>
          {part}
        </span>
      );
    }
    return part;
  });
}

function resolveBubblePadding(message: ChatMessage, isVideoFile: boolean): string {
  if (message.type === 'image' || isVideoFile) {
    return '8px 0 10px';
  }
  if (message.type === 'audio') {
    return '8px 0 6px';
  }
  if (message.type === 'file') {
    return '10px 0 6px';
  }
  return '6px 0';
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  isGroupChat,
  roomId,
  isAssistantRoom = false,
  participants,
  currentUserId,
  currentNickname,
  auth,
  isSelected,
  currentAudioRef,
  receipt,
  onSelect,
  onOpenActions,
  onReply,
  onDelete,
  onForward,
  onAudioPlayed,
  onRetry,
  entrancePhase = 'none',
  entranceIndex = 0,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const { theme, getRoomAppearance } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [entrance] = useState(entrancePhase);
  const [staggerIndex] = useState(entranceIndex);
  const actionsPresence = usePresence(isSelected, MOTION_DURATION_MS.fast);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const isVisible = useInViewport(bubbleRef);
  const { language } = useAppLanguage();
  // The assistant already answers in the right language (even a deliberately different one), so it is never translated.
  const autoTranslate = useContext(AutoTranslateContext) && !isAssistantRoom;
  // Only delivered messages are translated, own ones included (one sent in the other language, e.g. translated before
  // sending, reads back in the interface language); never pending, failed or deleted ones.
  const canTranslate = !message.pending && !message.failed && !message.deletedForEveryone;
  const originalContent = (isAssistantRoom && !isOwn ? localizeAssistantWelcome(message.content, language) : null) ?? message.content;
  const contentTranslation = useMessageTranslation({
    roomId,
    messageId: message.id,
    field: 'content',
    text: canTranslate && message.type === 'text' ? originalContent : null,
    enabled: autoTranslate,
    isVisible,
  });
  const captionTranslation = useMessageTranslation({
    roomId,
    messageId: message.id,
    field: 'caption',
    text: canTranslate && message.type !== 'text' ? message.caption : null,
    enabled: autoTranslate,
    isVisible,
  });

  if (message.deletedForEveryone) {
    return <DeletedMessageBubble isOwn={isOwn} roomId={roomId} entrancePhase={entrance} />;
  }

  if (message.type === 'error') {
    return <ErrorMessageBubble message={message} entrancePhase={entrance} />;
  }

  if (message.type === 'system') {
    return <SystemMessageBubble message={message} currentNickname={currentNickname} entrancePhase={entrance} />;
  }

  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);
  const statusInfo = getMessageStatus(message, isOwn, isGroupChat, participants, currentUserId);
  const isImageMessage = message.type === 'image';
  const isAudioMessage = message.type === 'audio';
  const isFileMessage = message.type === 'file';
  const isVideoFile = isFileMessage && Boolean(message.fileMeta?.mimeType.startsWith('video/'));
  const content = contentTranslation.text || originalContent;
  const caption = captionTranslation.text || message.caption;
  const truncatedContent = message.type === 'text' && !isExpanded ? truncateLongText(content) : null;
  const displayContent = truncatedContent ?? content;
  const hasLinkPreview = message.type === 'text' && Boolean(message.linkPreview);
  const linkPreviewCaption = hasLinkPreview ? removeFirstUrl(content) : '';
  const contentBadge = (
    <TranslationBadge result={contentTranslation.result} showingOriginal={contentTranslation.showingOriginal} onToggle={contentTranslation.toggleOriginal} bubble={bubbleStyle} />
  );
  const captionBadge = (
    <TranslationBadge result={captionTranslation.result} showingOriginal={captionTranslation.showingOriginal} onToggle={captionTranslation.toggleOriginal} bubble={bubbleStyle} />
  );
  // One badge per bubble, in the bottom row next to the time: text messages translate the content, media the caption.
  const metaBadge = message.type === 'text' ? contentBadge : caption ? captionBadge : null;
  const textAccentColor = bubbleStyle.accentColor;

  const handleRetry = () => {
    if (message.clientTempId) {
      onRetry(message.clientTempId);
    }
  };

  const renderBody = () => {
    if (isImageMessage) {
      return <ImageMessageContent message={message} />;
    }
    if (isAudioMessage) {
      return (
        <AudioMessageContent
          message={message}
          isOwn={isOwn}
          bubble={bubbleStyle}
          currentUserId={currentUserId}
          currentAudioRef={currentAudioRef}
          onAudioPlayed={onAudioPlayed}
        />
      );
    }
    if (isVideoFile) {
      return <VideoMessageContent message={message} />;
    }
    if (isFileMessage) {
      return <FileMessageContent message={message} bubble={bubbleStyle} fileTypeIcon={getFileTypeIcon(message.fileMeta?.mimeType ?? '')} />;
    }
    if (hasLinkPreview) {
      return null;
    }

    return (
      <div style={{ padding: '4px 12px 0', minWidth: 0 }}>
        <p style={MESSAGE_TEXT_STYLE}>
          {renderMessageContent(displayContent, participants, textAccentColor)}
          {truncatedContent !== null && (
            <>
              {'… '}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsExpanded(true);
                }}
                className="sc-read-more"
                style={{ color: textAccentColor }}
              >
                {t('chat.message.readMore')}
              </button>
            </>
          )}
        </p>
      </div>
    );
  };

  return (
    <MessageBubbleShell
      isOwn={isOwn}
      isGroupChat={isGroupChat}
      roomId={roomId}
      messageId={message.id}
      senderId={message.sender.id}
      senderNickname={message.sender.unknown ? t('common.unknownUser') : message.sender.nickname}
      currentUserId={currentUserId}
      isSelected={isSelected}
      onSelect={() => onSelect(message.id)}
      onOpenActions={() => onOpenActions(message.id)}
      allowCustomContextMenu={!message.pending && !message.failed}
      padding={resolveBubblePadding(message, isVideoFile)}
      cornerRadius={isImageMessage || isVideoFile ? 20 : 16}
      entrancePhase={entrance}
      entranceIndex={staggerIndex}
      containerRef={bubbleRef}
      extraClassName={isAudioMessage ? ' is-audio' : ''}
      minWidth={message.type === 'text' ? (message.linkPreview ? `${LINK_PREVIEW_BUBBLE_WIDTH}px` : '64px') : undefined}
      afterBubble={
        <>
          {receipt && <MessageReceiptRow receipt={receipt} isOwn={isOwn} />}
          {actionsPresence.isPresent && !message.pending && !message.failed && (
            <MessageActionsRow
              isOwn={isOwn}
              isExiting={actionsPresence.isExiting}
              onReply={() => onReply(message)}
              onDelete={() => onDelete([message.id])}
              onForward={() => onForward([message])}
            />
          )}
        </>
      }
    >
      {message.replyTo && (
        <MessageReplyQuote replyTo={message.replyTo} parentType={message.type} isOwn={isOwn} bubble={bubbleStyle} currentUserId={currentUserId} />
      )}

      {renderBody()}

      {hasLinkPreview && message.linkPreview && (
        <div style={{ padding: '4px 12px 0', minWidth: 0 }}>
          <LinkPreviewCard preview={message.linkPreview} auth={auth} variant="bubble" bubble={bubbleStyle} />
        </div>
      )}

      {hasLinkPreview && linkPreviewCaption && (
        <div style={{ padding: '4px 12px 0', minWidth: 0 }}>
          <p style={MESSAGE_TEXT_STYLE}>{linkPreviewCaption}</p>
        </div>
      )}

      {message.type !== 'text' && caption && (
        <div style={MEDIA_CAPTION_STYLE}>
          <p style={MESSAGE_TEXT_STYLE}>{renderMessageContent(caption, participants, textAccentColor)}</p>
        </div>
      )}

      <MessageMeta message={message} isOwn={isOwn} bubble={bubbleStyle} statusInfo={statusInfo} onRetry={handleRetry} leading={metaBadge} />
    </MessageBubbleShell>
  );
});
