import { useState } from 'react';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import { getMessageStatus, type MessageReceiptInfo } from '@lib/message-status';
import type { RoomParticipant } from '@lib/socket';
import type { ChatMessage } from '../types';
import { ImageModal } from './ImageModal';
import { MessageActionsRow } from './MessageActionsRow';
import { MessageBubbleShell } from './MessageBubbleShell';
import { MessageMeta } from './MessageMeta';
import { MessageReceiptRow } from './MessageReceiptRow';

interface ImageGroupBubbleProps {
  images: ChatMessage[];
  isOwn: boolean;
  isGroupChat: boolean;
  roomId: string;
  participants: RoomParticipant[];
  currentUserId: string | undefined;
  isSelected: boolean;
  receipt: MessageReceiptInfo | null;
  onSelect: () => void;
  onReply: () => void;
  onDelete: () => void;
  onForward: () => void;
  onRetry: () => void;
}

const MAX_GROUP_TILES = 4;

export function ImageGroupBubble({
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
}: ImageGroupBubbleProps) {
  const { theme, getRoomAppearance } = useTheme();
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const anchor = images[images.length - 1] ?? images[0];
  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);
  const statusInfo = anchor ? getMessageStatus(anchor, isOwn, isGroupChat, participants, currentUserId) : null;
  const visibleTiles = images.slice(0, MAX_GROUP_TILES);
  const extraCount = images.length - visibleTiles.length;

  if (!anchor) {
    return null;
  }

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
      onSelect={onSelect}
      padding="4px 0 6px"
      cornerRadius={20}
      afterBubble={
        <>
          {receipt && <MessageReceiptRow receipt={receipt} isOwn={isOwn} />}
          {isSelected && <MessageActionsRow isOwn={isOwn} onReply={onReply} onDelete={onDelete} onForward={onForward} />}
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

      <MessageMeta message={anchor} isOwn={isOwn} bubble={bubbleStyle} statusInfo={statusInfo} onRetry={onRetry} />
    </MessageBubbleShell>
  );
}
