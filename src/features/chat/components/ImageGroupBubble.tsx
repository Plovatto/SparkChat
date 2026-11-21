import { memo, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaPlay } from 'react-icons/fa';
import { MOTION_DURATION_MS, usePresence, type EntrancePhase } from '@features/motion';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import { getMessageStatus, type MessageReceiptInfo } from '@lib/message-status';
import type { RoomParticipant } from '@lib/socket';
import type { ChatMessage } from '../types';
import { renderVideoThumbnail } from '../utils/render-video-thumbnail';
import { toLocalMediaUrl } from '../utils/safe-media-url';
import { ImageModal } from './ImageModal';
import { MessageActionsRow } from './MessageActionsRow';
import type { MessageBubbleActions } from './MessageBubble';
import { MessageBubbleShell, type BubbleRunPosition } from './MessageBubbleShell';
import { MessageMeta } from './MessageMeta';
import { MessageReceiptRow } from './MessageReceiptRow';
import { UnencryptedNotice } from './UnencryptedNotice';
import { VideoPreviewModal } from './VideoPreviewModal';
import { useMediaViewer } from './media-viewer/media-viewer-context';

interface ImageGroupBubbleProps extends MessageBubbleActions {
  images: ChatMessage[];
  isOwn: boolean;
  isGroupChat: boolean;
  roomId: string;
  participants: RoomParticipant[];
  currentUserId: string | undefined;
  isSelected: boolean;
  receipt: MessageReceiptInfo | null;
  entrancePhase?: EntrancePhase;
  entranceIndex?: number;
  run?: BubbleRunPosition;
  canDelete?: boolean;
  onReact?: (message: ChatMessage) => void;
  reactions?: ReactNode;
}

const MAX_GROUP_TILES = 4;
const VIDEO_TILE_WIDTH = 240;

function isVideoMessage(message: ChatMessage): boolean {
  return message.type === 'file' && Boolean(message.fileMeta?.mimeType.startsWith('video/'));
}

function VideoTileImage({ message, alt }: { message: ChatMessage; alt: string }) {
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderVideoThumbnail(message.content, VIDEO_TILE_WIDTH)
      .then((result) => {
        if (!cancelled) {
          setPoster(result.dataUrl);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [message.content]);

  return poster ? <img src={poster} alt={alt} /> : null;
}

export const ImageGroupBubble = memo(function ImageGroupBubble({
  images,
  isOwn,
  isGroupChat,
  roomId,
  participants,
  currentUserId,
  isSelected,
  receipt,
  onSelect,
  onOpenActions,
  onReply,
  onDelete,
  onForward,
  onRetry,
  entrancePhase = 'none',
  entranceIndex = 0,
  run,
  canDelete = isOwn,
  onReact,
  reactions,
}: ImageGroupBubbleProps) {
  const { t } = useTranslation();
  const { theme, getRoomAppearance } = useTheme();
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [videoMessage, setVideoMessage] = useState<ChatMessage | null>(null);
  const mediaViewer = useMediaViewer();
  const [entrance] = useState(entrancePhase);
  const [staggerIndex] = useState(entranceIndex);
  const actionsPresence = usePresence(isSelected, MOTION_DURATION_MS.fast);
  const anchor = images[images.length - 1] ?? images[0];
  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);
  const visibleTiles = images.slice(0, MAX_GROUP_TILES);
  const extraCount = images.length - visibleTiles.length;
  const photoMessages = images.filter((image) => !isVideoMessage(image));
  const senderAvatar = anchor ? participants.find((participant) => participant.id === anchor.sender.id)?.avatar : undefined;
  const hasPendingOrFailed = images.some((image) => image.pending || image.failed);
  const statusTileIndex = extraCount > 0 ? visibleTiles.length - 2 : visibleTiles.length - 1;

  if (!anchor) {
    return null;
  }

  const handleRetry = (message: ChatMessage) => () => {
    if (message.clientTempId) {
      onRetry(message.clientTempId);
    }
  };

  const openTile = (image: ChatMessage, index: number) => {
    if (mediaViewer?.open(image.id)) {
      return;
    }
    const isLastVisible = index === visibleTiles.length - 1;
    if (isLastVisible && extraCount > 0) {
      setModalIndex(Math.max(0, photoMessages.indexOf(image)));
      return;
    }
    if (isVideoMessage(image)) {
      setVideoMessage(image);
      return;
    }
    setModalIndex(Math.max(0, photoMessages.indexOf(image)));
  };

  return (
    <MessageBubbleShell
      isOwn={isOwn}
      isGroupChat={isGroupChat}
      roomId={roomId}
      messageId={anchor.id}
      senderId={anchor.sender.id}
      senderNickname={anchor.sender.unknown ? t('common.unknownUser') : anchor.sender.nickname}
      senderAvatar={senderAvatar}
      currentUserId={currentUserId}
      isSelected={isSelected}
      onSelect={() => onSelect(anchor.id)}
      onOpenActions={() => onOpenActions(anchor.id)}
      allowCustomContextMenu={!hasPendingOrFailed}
      padding="0"
      variant="media"
      run={run}
      entrancePhase={entrance}
      entranceIndex={staggerIndex}
      cornerRadius={14}
      minWidth="0"
      reactions={reactions}
      afterBubble={
        <>
          {receipt && <MessageReceiptRow receipt={receipt} isOwn={isOwn} />}
          {actionsPresence.isPresent && !hasPendingOrFailed && (
            <MessageActionsRow
              isOwn={isOwn}
              isExiting={actionsPresence.isExiting}
              canDelete={canDelete}
              onReply={() => onReply(anchor)}
              onDelete={() => onDelete(images.map((image) => image.id))}
              onForward={() => onForward(images)}
              onReact={onReact ? () => onReact(anchor) : undefined}
              onDismiss={() => onSelect(anchor.id)}
            />
          )}
          <ImageModal
            isOpen={modalIndex !== null}
            images={photoMessages.map((image) => image.content)}
            roomId={roomId}
            messageIds={photoMessages.map((image) => image.id)}
            fileMetas={photoMessages.map((image) => image.fileMeta)}
            startIndex={modalIndex ?? 0}
            onClose={() => setModalIndex(null)}
          />
          <VideoPreviewModal
            isOpen={videoMessage !== null}
            onClose={() => setVideoMessage(null)}
            url={videoMessage?.content ?? ''}
            fileName={videoMessage?.fileMeta?.name ?? t('chat.message.defaultVideoName')}
            roomId={roomId}
            messageId={videoMessage?.id}
            fileMeta={videoMessage?.fileMeta}
          />
        </>
      }
    >
      {images.some((image) => image.unencrypted) && <UnencryptedNotice />}
      <div className="sc-album" role="group" aria-label={t('chat.message.album', { count: images.length })}>
        {visibleTiles.map((image, index) => {
          const isLastTile = index === visibleTiles.length - 1;
          const isVideo = isVideoMessage(image);
          const showsMore = isLastTile && extraCount > 0;
          const alt = isVideo ? t('chat.message.video') : t('chat.message.sentImage');
          return (
            <button
              type="button"
              key={image.id}
              className="sc-album__tile sc-anim-pop-in"
              style={{ animationDelay: `${index * 45}ms` }}
              aria-label={showsMore ? t('chat.message.albumMore', { count: extraCount }) : alt}
              onClick={(event) => {
                event.stopPropagation();
                openTile(image, index);
              }}
            >
              {isVideo ? (
                <VideoTileImage message={image} alt={alt} />
              ) : (
                <img src={toLocalMediaUrl(image.fileMeta?.thumbnailUrl) ?? toLocalMediaUrl(image.content)} alt={alt} />
              )}
              {isVideo && !showsMore && (
                <span className="sc-album__play" aria-hidden="true">
                  <FaPlay size={13} />
                </span>
              )}
              {showsMore ? (
                <span className="sc-album__more" aria-hidden="true">
                  +{extraCount}
                </span>
              ) : (
                <MessageMeta
                  message={image}
                  isOwn={isOwn}
                  bubble={bubbleStyle}
                  statusInfo={index === statusTileIndex ? getMessageStatus(anchor, isOwn, isGroupChat, participants, currentUserId) : null}
                  onRetry={handleRetry(image)}
                  placement="overlay"
                />
              )}
            </button>
          );
        })}
      </div>
    </MessageBubbleShell>
  );
});
