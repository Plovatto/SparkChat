import { memo, useState, type CSSProperties, type RefObject, type ReactNode } from 'react';
import { MOTION_DURATION_MS, usePresence, type EntrancePhase } from '@features/motion';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import type { SessionAuth } from '@lib/api/session-auth';
import { getMessageStatus, type MessageReceiptInfo } from '@lib/message-status';
import type { RoomParticipant } from '@lib/socket';
import type { ChatMessage } from '../types';
import { removeFirstUrl } from '../utils/extract-first-url';
import { getFileTypeIcon } from '../utils/get-file-type-icon';
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
import { VideoMessageContent } from './VideoMessageContent';

export interface MessageBubbleActions {
  onSelect: (messageId: string) => void;
  onReply: (message: ChatMessage) => void;
  onDelete: (messageId: string) => void;
  onForward: (message: ChatMessage) => void;
  onRetry: (clientTempId: string) => void;
}

interface MessageBubbleProps extends MessageBubbleActions {
  message: ChatMessage;
  isOwn: boolean;
  isGroupChat: boolean;
  roomId: string;
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

const MAX_PREVIEW_LENGTH = 200;
const LINK_PREVIEW_BUBBLE_WIDTH = 300;
const MENTION_TOKEN_PATTERN = /(@[\p{L}\p{N}_]+)/gu;

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
  participants,
  currentUserId,
  currentNickname,
  auth,
  isSelected,
  currentAudioRef,
  receipt,
  onSelect,
  onReply,
  onDelete,
  onForward,
  onAudioPlayed,
  onRetry,
  entrancePhase = 'none',
  entranceIndex = 0,
}: MessageBubbleProps) {
  const { theme, getRoomAppearance } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [entrance] = useState(entrancePhase);
  const [staggerIndex] = useState(entranceIndex);
  const actionsPresence = usePresence(isSelected, MOTION_DURATION_MS.fast);

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
  const showExpand = message.type === 'text' && message.content.length > MAX_PREVIEW_LENGTH;
  const displayContent = showExpand && !isExpanded ? `${message.content.substring(0, MAX_PREVIEW_LENGTH)}...` : message.content;
  const hasLinkPreview = message.type === 'text' && Boolean(message.linkPreview);
  const linkPreviewCaption = hasLinkPreview ? removeFirstUrl(message.content) : '';
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
          {showExpand && (
            <>
              {' '}
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsExpanded((previous) => !previous);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.stopPropagation();
                    event.preventDefault();
                    setIsExpanded((previous) => !previous);
                  }
                }}
                className="sc-link"
                style={{ whiteSpace: 'nowrap', fontWeight: 700, textDecoration: 'underline', color: textAccentColor }}
              >
                {isExpanded ? 'ver menos' : 'ver mais'}
              </span>
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
      senderNickname={message.sender.nickname}
      currentUserId={currentUserId}
      isSelected={isSelected}
      onSelect={() => onSelect(message.id)}
      padding={resolveBubblePadding(message, isVideoFile)}
      cornerRadius={isImageMessage || isVideoFile ? 20 : 16}
      entrancePhase={entrance}
      entranceIndex={staggerIndex}
      extraClassName={isAudioMessage ? ' is-audio' : ''}
      minWidth={message.type === 'text' ? (message.linkPreview ? `${LINK_PREVIEW_BUBBLE_WIDTH}px` : '64px') : undefined}
      afterBubble={
        <>
          {receipt && <MessageReceiptRow receipt={receipt} isOwn={isOwn} />}
          {actionsPresence.isPresent && (
            <MessageActionsRow
              isOwn={isOwn}
              isExiting={actionsPresence.isExiting}
              onReply={() => onReply(message)}
              onDelete={() => onDelete(message.id)}
              onForward={() => onForward(message)}
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

      {message.type !== 'text' && message.caption && (
        <div style={{ padding: '4px 12px 0', minWidth: 0 }}>
          <p style={MESSAGE_TEXT_STYLE}>{message.caption}</p>
        </div>
      )}

      <MessageMeta message={message} isOwn={isOwn} bubble={bubbleStyle} statusInfo={statusInfo} onRetry={handleRetry} />
    </MessageBubbleShell>
  );
});
