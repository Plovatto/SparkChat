import { memo, useCallback, useContext, useRef, useState, type CSSProperties, type RefObject, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MOTION_DURATION_MS, usePresence, type EntrancePhase } from '@features/motion';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import { useInViewport } from '@hooks/useInViewport';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { getMessageStatus, type MessageReceiptInfo } from '@lib/message-status';
import type { RoomParticipant } from '@lib/socket';
import type { IncomingAssessment } from '@lib/translation/incoming';
import { RoomTranslationContext } from '../hooks/room-translation-context';
import { useMessageReactionUi } from '../hooks/useMessageReactionUi';
import { useMessageTranslation } from '../hooks/useMessageTranslation';
import type { ChatMessage } from '../types';
import { localizeAssistantWelcome } from '../utils/assistant-welcome';
import { canReactToMessage } from '../utils/reactions';
import { getFileTypeIcon } from '../utils/get-file-type-icon';
import { hasDisplayableLinkPreviewImage } from '../utils/link-preview-target';
import { renderRichText } from '../utils/rich-text';
import { resolveSenderAvatar } from '../utils/sender-avatar';
import type { AssistantButton } from '@features/assistant/assistant-card';
import { AssistantCardView } from '@features/assistant/components/AssistantCardView';
import { truncateLongText } from '../utils/truncate-long-text';
import { AudioMessageContent, type CurrentAudioRef } from './AudioMessageContent';
import { FileMessageContent } from './FileMessageContent';
import { ImageMessageContent } from './ImageMessageContent';
import { LinkPreviewCard } from './LinkPreviewCard';
import { MessageActionsRow } from './MessageActionsRow';
import { MessageBubbleShell, type BubbleRunPosition, type BubbleVariant } from './MessageBubbleShell';
import { MessageMeta, MessageMetaSpacer, type MessageMetaPlacement } from './MessageMeta';
import { MessageReceiptRow } from './MessageReceiptRow';
import { MessageReplyQuote } from './MessageReplyQuote';
import { DeletedMessageBubble, ErrorMessageBubble, SystemMessageBubble } from './SpecialMessageBubbles';
import { TranslationBadge } from './TranslationBadge';
import { UnencryptedNotice } from './UnencryptedNotice';
import { VideoMessageContent } from './VideoMessageContent';

export interface MessageBubbleActions {
  onSelect: (messageId: string) => void;
  onOpenActions: (messageId: string) => void;
  onReply: (message: ChatMessage) => void;
  onDelete: (messageIds: string[]) => void;
  onForward: (messages: ChatMessage[]) => void;
  onRetry: (clientTempId: string) => void;
  onStartSelection?: ((messageId: string) => void) | undefined;
  onReact: (messageId: string, emoji: string | null) => void;
  onCopyText?: (text: string) => void;
}

interface MessageBubbleProps extends MessageBubbleActions {
  message: ChatMessage;
  isOwn: boolean;
  isGroupChat: boolean;
  roomId: string;
  isAssistantRoom?: boolean;
  onQuickReply?: ((cardId: string, button: AssistantButton) => void) | undefined;
  participants: RoomParticipant[];
  currentUserId: string | undefined;
  currentNickname: string;
  isSelected: boolean;
  currentAudioRef: RefObject<CurrentAudioRef | null>;
  receipt: MessageReceiptInfo | null;
  onAudioPlayed: (messageId: string) => void;
  entrancePhase?: EntrancePhase;
  entranceIndex?: number;
  run?: BubbleRunPosition;
}

const LINK_PREVIEW_BUBBLE_WIDTH = 300;

const MEDIA_CAPTION_STYLE: CSSProperties = { width: 0, minWidth: '100%', boxSizing: 'border-box' };

const MESSAGE_TEXT_STYLE: CSSProperties = {
  margin: 0,
  fontSize: '0.95rem',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  fontWeight: 400,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
};

function resolveBubblePadding(message: ChatMessage, variant: BubbleVariant): string {
  if (variant !== 'bubble') {
    return '0';
  }
  if (message.type === 'audio') {
    return '8px 0 6px';
  }
  if (message.type === 'file') {
    return '10px 0 6px';
  }
  return '0';
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  isGroupChat,
  roomId,
  isAssistantRoom = false,
  onQuickReply,
  participants,
  currentUserId,
  currentNickname,
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
  onStartSelection,
  onReact,
  onCopyText,
  entrancePhase = 'none',
  entranceIndex = 0,
  run,
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
  const roomTranslation = useContext(RoomTranslationContext);
  const translationMode = isAssistantRoom ? 'off' : roomTranslation.mode;
  const { reportAssessment, reportManualTranslation } = roomTranslation;
  const canTranslate = !isOwn && !message.pending && !message.failed && !message.deletedForEveryone;
  const handleAssessed = useCallback(
    (assessment: IncomingAssessment) => reportAssessment(message.id, message.timestamp, assessment),
    [reportAssessment, message.id, message.timestamp],
  );
  const handleManualTranslation = useCallback(() => reportManualTranslation(message.id), [reportManualTranslation, message.id]);
  const dismissActions = useCallback(() => {
    if (isSelected) {
      onSelect(message.id);
    }
  }, [isSelected, onSelect, message.id]);
  const reactionChipBackground = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn).background;
  const reactionUi = useMessageReactionUi({
    messageId: message.id,
    reactions: message.reactions,
    canReact: canReactToMessage(message),
    isOwn,
    isSelected,
    currentUserId,
    participants,
    onReact,
    onDismiss: dismissActions,
    showCount: isGroupChat,
    chipBackground: reactionChipBackground,
  });
  const originalContent = (isAssistantRoom && !isOwn ? localizeAssistantWelcome(message.content, language) : null) ?? message.content;
  const contentTranslation = useMessageTranslation({
    roomId,
    messageId: message.id,
    field: 'content',
    text: canTranslate && message.type === 'text' ? originalContent : null,
    mode: translationMode,
    isVisible,
    onAssessed: handleAssessed,
    onManualTranslation: handleManualTranslation,
  });
  const captionTranslation = useMessageTranslation({
    roomId,
    messageId: message.id,
    field: 'caption',
    text: canTranslate && message.type !== 'text' ? message.caption : null,
    mode: translationMode,
    isVisible,
    onAssessed: handleAssessed,
    onManualTranslation: handleManualTranslation,
  });

  if (message.deletedForEveryone) {
    return (
      <DeletedMessageBubble
        isOwn={isOwn}
        roomId={roomId}
        entrancePhase={entrance}
        isSelected={isSelected}
        onSelect={() => onSelect(message.id)}
        onDelete={() => onDelete([message.id])}
        onStartSelection={onStartSelection ? () => onStartSelection(message.id) : undefined}
      />
    );
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
  const isVisualMedia = isImageMessage || isVideoFile;
  const content = contentTranslation.text || originalContent;
  const caption = captionTranslation.text || message.caption;
  const truncatedContent = message.type === 'text' && !isExpanded ? truncateLongText(content) : null;
  const displayContent = truncatedContent ?? content;
  const linkPreview = message.type === 'text' ? message.linkPreview : undefined;
  const hasLinkPreview = Boolean(linkPreview);
  const hasFlushLinkPreview = Boolean(linkPreview && hasDisplayableLinkPreviewImage(linkPreview.imageUrl));
  const hasMediaChrome = Boolean(caption || message.replyTo || message.unencrypted);
  const variant: BubbleVariant = isVisualMedia ? (hasMediaChrome ? 'media-caption' : 'media') : hasFlushLinkPreview ? 'media-caption' : 'bubble';
  const badgeTranslation = message.type === 'text' ? contentTranslation : caption ? captionTranslation : null;
  const metaBadge =
    badgeTranslation && translationMode !== 'off' && canTranslate ? (
      <TranslationBadge
        control={badgeTranslation.control}
        result={badgeTranslation.result}
        onToggle={badgeTranslation.toggleOriginal}
        onTranslate={badgeTranslation.requestTranslation}
        bubble={bubbleStyle}
      />
    ) : null;
  const isBadgeVisible = Boolean(metaBadge && badgeTranslation && badgeTranslation.control !== 'none');
  const textAccentColor = bubbleStyle.accentColor;
  const senderAvatar = resolveSenderAvatar(participants, message.sender);

  const handleRetry = () => {
    if (message.clientTempId) {
      onRetry(message.clientTempId);
    }
  };

  const meta = (placement: MessageMetaPlacement) => (
    <MessageMeta
      message={message}
      isOwn={isOwn}
      bubble={bubbleStyle}
      statusInfo={statusInfo}
      onRetry={handleRetry}
      leading={isBadgeVisible ? metaBadge : undefined}
      placement={isBadgeVisible && placement === 'inline' ? 'row' : placement}
    />
  );

  const textBlock = (text: ReactNode, withReadMore: boolean) => (
    <div className="sc-bubble-text">
      <p style={MESSAGE_TEXT_STYLE}>
        {text}
        {withReadMore && truncatedContent !== null && (
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
        {!isBadgeVisible && <MessageMetaSpacer isOwn={isOwn} />}
      </p>
      {meta('inline')}
    </div>
  );

  const renderBody = () => {
    if (isImageMessage) {
      return <ImageMessageContent message={message} flush />;
    }
    if (isVideoFile) {
      return <VideoMessageContent message={message} flush />;
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
    if (isFileMessage) {
      return <FileMessageContent message={message} bubble={bubbleStyle} fileTypeIcon={getFileTypeIcon(message.fileMeta?.mimeType ?? '')} />;
    }
    return null;
  };

  const renderFooter = () => {
    if (message.type === 'text') {
      return textBlock(renderRichText(displayContent, participants, textAccentColor), true);
    }
    if (isVisualMedia) {
      return caption ? (
        <div style={MEDIA_CAPTION_STYLE}>{textBlock(renderRichText(caption, participants, textAccentColor), false)}</div>
      ) : (
        meta(hasMediaChrome ? 'row' : 'overlay')
      );
    }
    return (
      <>
        {caption && <div style={MEDIA_CAPTION_STYLE}>{textBlock(renderRichText(caption, participants, textAccentColor), false)}</div>}
        {!caption && meta('row')}
      </>
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
      senderAvatar={senderAvatar}
      currentUserId={currentUserId}
      isSelected={isSelected}
      onSelect={() => onSelect(message.id)}
      onOpenActions={() => onOpenActions(message.id)}
      allowCustomContextMenu={!message.pending && !message.failed}
      padding={resolveBubblePadding(message, variant)}
      variant={variant}
      run={run}
      cornerRadius={variant === 'bubble' ? 12 : 14}
      entrancePhase={entrance}
      entranceIndex={staggerIndex}
      containerRef={bubbleRef}
      extraClassName={isAudioMessage ? ' is-audio' : ''}
      minWidth={message.type === 'text' ? (hasLinkPreview ? `min(${LINK_PREVIEW_BUBBLE_WIDTH}px, 100%)` : '0') : undefined}
      reactions={reactionUi.chips}
      bubbleSide={
        actionsPresence.isPresent && !message.pending && !message.failed ? (
          <MessageActionsRow
            isOwn={isOwn}
            isExiting={actionsPresence.isExiting}
            canDelete
            canCopy={message.type === 'text' || Boolean(message.caption)}
            canTranslate={canTranslate && Boolean(badgeTranslation)}
            onReply={() => onReply(message)}
            onDelete={() => onDelete([message.id])}
            onForward={() => onForward([message])}
            onCopy={() => {
              const text = message.type === 'text' ? originalContent : (message.caption ?? '');
              if (onCopyText) {
                onCopyText(text);
              } else {
                void navigator.clipboard?.writeText(text);
              }
            }}
            onTranslate={() => badgeTranslation?.requestTranslation()}
            onStartSelection={onStartSelection ? () => onStartSelection(message.id) : undefined}
            onReact={reactionUi.canReact ? reactionUi.onReactButton : undefined}
            reactButtonRef={reactionUi.reactButtonRef}
            isReactionOpen={reactionUi.isReactionOpen}
            reactionPopover={reactionUi.compact ? null : reactionUi.quickBar}
            sheetHeader={reactionUi.compact ? reactionUi.quickBar : null}
            onDismiss={() => onSelect(message.id)}
          />
        ) : null
      }
      afterBubble={
        <>
          {receipt && <MessageReceiptRow receipt={receipt} isOwn={isOwn} />}
          {reactionUi.overlays}
          {isAssistantRoom && message.card && onQuickReply && (
            <AssistantCardView card={message.card} cardId={message.id} resolvedChoice={message.resolvedChoice} onQuickReply={onQuickReply} />
          )}
        </>
      }
    >
      {message.unencrypted && <UnencryptedNotice />}

      {message.replyTo && (
        <div className={variant === 'bubble' ? undefined : 'sc-bubble-quote-pad'}>
          <MessageReplyQuote replyTo={message.replyTo} parentType={message.type} isOwn={isOwn} bubble={bubbleStyle} currentUserId={currentUserId} />
        </div>
      )}

      {linkPreview && (
        <div className={hasFlushLinkPreview ? 'sc-link-preview-flush' : 'sc-link-preview-inset'}>
          <LinkPreviewCard preview={linkPreview} variant="bubble" bubble={bubbleStyle} messageText={originalContent} flush={hasFlushLinkPreview} />
        </div>
      )}

      {renderBody()}

      {renderFooter()}
      {metaBadge && !isBadgeVisible && metaBadge}
    </MessageBubbleShell>
  );
});
