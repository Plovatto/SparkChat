import { memo, useState } from 'react';
import { MOTION_DURATION_MS, usePresence, type EntrancePhase } from '@features/motion';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import { getMessageStatus, type MessageReceiptInfo } from '@lib/message-status';
import type { RoomParticipant } from '@lib/socket';
import type { ChatMessage } from '../types';
import { ImageModal } from './ImageModal';
import { MessageActionsRow } from './MessageActionsRow';
import type { MessageBubbleActions } from './MessageBubble';
import { MessageBubbleShell } from './MessageBubbleShell';
import { MessageMeta } from './MessageMeta';
import { MessageReceiptRow } from './MessageReceiptRow';

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
}

const MAX_GROUP_TILES = 4;

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
  onReply,
  onDelete,
  onForward,
  onRetry,
  entrancePhase = 'none',
  entranceIndex = 0,
}: ImageGroupBubbleProps) {
  const { theme, getRoomAppearance } = useTheme();
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [entrance] = useState(entrancePhase);
  const [staggerIndex] = useState(entranceIndex);
  const actionsPresence = usePresence(isSelected, MOTION_DURATION_MS.fast);
  const anchor = images[images.length - 1] ?? images[0];
  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);
  const statusInfo = anchor ? getMessageStatus(anchor, isOwn, isGroupChat, participants, currentUserId) : null;
  const visibleTiles = images.slice(0, MAX_GROUP_TILES);
  const extraCount = images.length - visibleTiles.length;

  if (!anchor) {
    return null;
  }

  const handleRetry = () => {
    if (anchor.clientTempId) {
      onRetry(anchor.clientTempId);
    }
  };

  return (
    <MessageBubbleShell
      isOwn={isOwn}
      isGroupChat={isGroupChat}
      roomId={roomId}
      messageId={anchor.id}
      senderId={anchor.sender.id}
      senderNickname={anchor.sender.nickname}
      currentUserId={currentUserId}
      isSelected={isSelected}
      onSelect={() => onSelect(anchor.id)}
      padding="4px 0 6px"
      entrancePhase={entrance}
      entranceIndex={staggerIndex}
      cornerRadius={20}
      afterBubble={
        <>
          {receipt && <MessageReceiptRow receipt={receipt} isOwn={isOwn} />}
          {actionsPresence.isPresent && (
            <MessageActionsRow
              isOwn={isOwn}
              isExiting={actionsPresence.isExiting}
              onReply={() => onReply(anchor)}
              onDelete={() => onDelete(anchor.id)}
              onForward={() => onForward(anchor)}
            />
          )}
          <ImageModal
            isOpen={modalIndex !== null}
            images={images.map((image) => image.content)}
            startIndex={modalIndex ?? 0}
            onClose={() => setModalIndex(null)}
          />
        </>
      }
    >
      <div
        style={{
          padding: '0 10px',
          display: 'grid',
          gridTemplateColumns: visibleTiles.length === 1 ? '1fr' : 'repeat(2, 1fr)',
          gap: '3px',
        }}
      >
        {visibleTiles.map((image, index) => {
          const isLastTile = index === visibleTiles.length - 1;
          return (
            <div
              key={image.id}
              onClick={(event) => {
                event.stopPropagation();
                setModalIndex(index);
              }}
              className="sc-media-thumb"
              style={{
                position: 'relative',
                aspectRatio: '1',
                borderRadius: '14px',
                overflow: 'hidden',
                background: theme.skeleton,
              }}
            >
              <img
                src={image.content}
                alt="Imagem enviada"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {isLastTile && extraCount > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: theme.scrim,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.onScrim,
                    fontSize: '1.3rem',
                    fontWeight: 700,
                  }}
                >
                  +{extraCount}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <MessageMeta message={anchor} isOwn={isOwn} bubble={bubbleStyle} statusInfo={statusInfo} onRetry={handleRetry} />
    </MessageBubbleShell>
  );
});
