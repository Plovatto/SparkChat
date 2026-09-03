import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { format } from 'date-fns';
import {
  FaBan,
  FaCheck,
  FaExclamationCircle,
  FaImage,
  FaPause,
  FaPlay,
  FaRegClock,
  FaReply,
  FaTrash,
} from 'react-icons/fa';
import { IconPillButton } from '@components/common/IconPillButton';
import { AVATARS } from '@features/auth/constants/avatars';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import type { ThemePalette } from '@features/theme';
import type { RoomParticipant } from '@features/rooms';
import { formatAudioTime, getDisplayName, processSystemMessage, splitSystemMessageActor } from '@lib/format';
import { getMessageStatus, type MessageReceiptInfo } from '@lib/message-status';
import type { ChatMessage } from '../types';
import { useAudioWaveform } from '../hooks/useAudioWaveform';
import { ImageModal } from './ImageModal';

export interface CurrentAudioRef {
  id: string;
  element: HTMLAudioElement;
  setIcon: (icon: 'play' | 'pause') => void;
}

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  isGroupChat: boolean;
  roomId: string;
  participants: RoomParticipant[];
  currentUserId: string | undefined;
  currentNickname: string;
  isSelected: boolean;
  currentAudioRef: MutableRefObject<CurrentAudioRef | null>;
  receipt: MessageReceiptInfo | null;
  onSelect: () => void;
  onReply: () => void;
  onDelete: () => void;
  onAudioPlayed: (messageId: string) => void;
  onRetry: () => void;
}

const MAX_PREVIEW_LENGTH = 200;
const WAVEFORM_BAR_COUNT = 40;

type StatusInfo = ReturnType<typeof getMessageStatus>;

interface MessageMetaProps {
  message: ChatMessage;
  isOwn: boolean;
  textColor: string;
  statusInfo: StatusInfo;
  statusColor: string;
  onRetry: () => void;
}

interface MessageActionsRowProps {
  isOwn: boolean;
  theme: ThemePalette;
  onReply: () => void;
  onDelete: () => void;
}

export function MessageActionsRow({ isOwn, theme, onReply, onDelete }: MessageActionsRowProps) {
  return (
    <div className="animate__animated animate__fadeIn animate__faster" style={{ display: 'flex', gap: '8px' }}>
      <IconPillButton
        onClick={(event) => {
          event.stopPropagation();
          onReply();
        }}
        background={theme.surface}
        textColor={theme.text}
        icon={<FaReply size={11} />}
        iconBackground={`${theme.primary}26`}
        iconColor={theme.primary}
        label="Responder"
      />

      {isOwn && (
        <IconPillButton
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          background={theme.surface}
          textColor={theme.text}
          icon={<FaTrash size={11} />}
          iconBackground="rgba(239, 83, 80, 0.16)"
          iconColor="#ef5350"
          label="Excluir"
        />
      )}
    </div>
  );
}

interface BubbleShellProps {
  isOwn: boolean;
  isGroupChat: boolean;
  roomId: string;
  senderId: string;
  senderNickname: string;
  currentUserId: string | undefined;
  onSelect: () => void;
  padding: string;
  extraClassName?: string;
  afterBubble?: ReactNode;
  children: ReactNode;
}

function BubbleShell({
  isOwn,
  isGroupChat,
  roomId,
  senderId,
  senderNickname,
  currentUserId,
  onSelect,
  padding,
  extraClassName = '',
  afterBubble,
  children,
}: BubbleShellProps) {
  const { theme, getRoomAppearance } = useTheme();
  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);

  return (
    <div
      data-message-bubble
      className={`animate__animated animate__fadeInUp animate__faster chat-bubble-wrap${extraClassName}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignItems: isOwn ? 'flex-end' : 'flex-start',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: '2px',
      }}
    >
      <div
        style={{
          background: bubbleStyle.background,
          color: bubbleStyle.textColor,
          borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          boxShadow: isOwn ? '0 2px 10px rgba(0, 0, 0, 0.18)' : '0 2px 8px rgba(0, 0, 0, 0.08)',
          backdropFilter: bubbleStyle.blur > 0 ? `blur(${bubbleStyle.blur}px)` : undefined,
          WebkitBackdropFilter: bubbleStyle.blur > 0 ? `blur(${bubbleStyle.blur}px)` : undefined,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          padding,
          minWidth: 0,
          maxWidth: '100%',
        }}
      >
        {!isOwn && isGroupChat && (
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.primary, padding: '4px 12px 0' }}>
            {getDisplayName(senderId, senderNickname, currentUserId)}
          </div>
        )}
        {children}
      </div>
      {afterBubble}
    </div>
  );
}

function MessageMeta({ message, isOwn, textColor, statusInfo, statusColor, onRetry }: MessageMetaProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', padding: '4px 12px 3px' }}>
      <span style={{ fontSize: '0.7rem', opacity: 0.6, color: textColor, fontWeight: 500 }}>
        {format(new Date(message.timestamp), 'HH:mm')}
      </span>
      {message.pending ? (
        <FaRegClock size={11} color={textColor} style={{ opacity: 0.8 }} />
      ) : message.failed ? (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
          title="Falha ao enviar. Toque para reenviar."
          style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#ff6b6b' }}
        >
          <FaExclamationCircle size={12} />
        </button>
      ) : (
        statusInfo && (
          <div style={{ display: 'flex', alignItems: 'center', opacity: isOwn ? 0.9 : 0.7 }}>
            {statusInfo.icon === 'double' ? (
              <>
                <FaCheck size={11} color={statusColor} />
                <FaCheck size={11} color={statusColor} style={{ marginLeft: '-6px' }} />
              </>
            ) : (
              <FaCheck size={11} color={statusColor} />
            )}
          </div>
        )
      )}
    </div>
  );
}

function MessageReceiptRow({ receipt, isOwn, theme }: { receipt: MessageReceiptInfo; isOwn: boolean; theme: ThemePalette }) {
  const label = receipt.type === 'read' ? 'Lida por:' : 'Entregue para:';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '0.7rem',
        color: theme.textSecondary,
        opacity: 0.7,
        marginTop: '4px',
        marginLeft: isOwn ? 'auto' : 0,
        paddingLeft: isOwn ? 0 : '12px',
      }}
    >
      <span style={{ fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', gap: '2px' }}>
        {receipt.users.map((participant) => {
          const avatar = AVATARS[participant.avatar] ?? AVATARS[0];
          const Icon = avatar?.icon;
          return (
            <div
              key={participant.id}
              title={participant.nickname}
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: avatar?.color ?? theme.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${theme.primary}33`,
                flexShrink: 0,
              }}
            >
              {Icon && <Icon size={10} color="white" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  isOwn,
  isGroupChat,
  roomId,
  participants,
  currentUserId,
  currentNickname,
  isSelected,
  currentAudioRef,
  receipt,
  onSelect,
  onReply,
  onDelete,
  onAudioPlayed,
  onRetry,
}: MessageBubbleProps) {
  const { theme, baseTheme, getRoomAppearance } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [playbackIcon, setPlaybackIcon] = useState<'play' | 'pause'>('play');
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [hasBeenPlayed, setHasBeenPlayed] = useState(false);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isAudioMessage = message.type === 'audio';
  const audioWaveform = useAudioWaveform(isAudioMessage ? message.content : null);

  useEffect(() => {
    if (!isAudioMessage) {
      return;
    }

    setHasBeenPlayed(isOwn ? message.playedBy.length > 0 : message.playedBy.includes(currentUserId ?? ''));
  }, [isAudioMessage, isOwn, message.playedBy, currentUserId]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (currentAudioRef.current?.id === message.id) {
        currentAudioRef.current.element.pause();
        currentAudioRef.current = null;
      }
    };
  }, [currentAudioRef, message.id]);

  const handleAudioToggle = () => {
    const audio = audioElementRef.current;
    if (!audio) {
      return;
    }

    if (playbackIcon === 'pause') {
      audio.pause();
      setPlaybackIcon('play');
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (currentAudioRef.current?.id === message.id) {
        currentAudioRef.current = null;
      }
      return;
    }

    const previous = currentAudioRef.current;
    if (previous && previous.id !== message.id) {
      previous.element.pause();
      previous.element.currentTime = 0;
      previous.setIcon('play');
    }

    if (!isOwn && !hasBeenPlayed) {
      setHasBeenPlayed(true);
      onAudioPlayed(message.id);
    }

    currentAudioRef.current = { id: message.id, element: audio, setIcon: setPlaybackIcon };
    void audio.play();
    setPlaybackIcon('pause');

    const animate = () => {
      if (audio.duration) {
        setPlaybackProgress(Math.min(WAVEFORM_BAR_COUNT, (audio.currentTime / audio.duration) * WAVEFORM_BAR_COUNT));
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
  };

  const handleAudioEnded = () => {
    setPlaybackIcon('play');
    setPlaybackProgress(0);
    setAudioCurrentTime(0);
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (currentAudioRef.current?.id === message.id) {
      currentAudioRef.current = null;
    }
  };

  if (message.deletedForEveryone) {
    const deletedBubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);
    return (
      <div
        className="animate__animated animate__fadeInUp animate__faster chat-bubble-wrap"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          alignSelf: isOwn ? 'flex-end' : 'flex-start',
          marginBottom: '2px',
        }}
      >
        <div
          style={{
            background: deletedBubbleStyle.background,
            color: deletedBubbleStyle.textColor,
            opacity: 0.65,
            borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            padding: '10px 14px',
            boxShadow: isOwn ? '0 2px 10px rgba(0, 0, 0, 0.18)' : '0 2px 8px rgba(0, 0, 0, 0.08)',
            backdropFilter: deletedBubbleStyle.blur > 0 ? `blur(${deletedBubbleStyle.blur}px)` : undefined,
            WebkitBackdropFilter: deletedBubbleStyle.blur > 0 ? `blur(${deletedBubbleStyle.blur}px)` : undefined,
            fontStyle: 'italic',
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FaBan size={13} style={{ flexShrink: 0 }} />
          <span>Mensagem deletada</span>
        </div>
      </div>
    );
  }

  if (message.type === 'system') {
    return (
      <div
        className="animate__animated animate__fadeIn"
        style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '15px 0' }}
      >
        <div
          style={{
            background: theme.primary,
            color: theme.headerTextColor,
            borderRadius: '12px',
            padding: '8px 16px',
            fontSize: '0.85rem',
            textAlign: 'center',
            maxWidth: '80%',
            fontStyle: 'italic',
            fontWeight: 500,
          }}
        >
          <p style={{ margin: 0, lineHeight: 1.4 }}>
            {(() => {
              const processed = processSystemMessage(message.content, currentNickname);
              const split = splitSystemMessageActor(processed);
              if (!split) {
                return processed;
              }
              return (
                <>
                  <span style={{ fontWeight: 700 }}>{split.actor}</span>
                  {split.rest}
                </>
              );
            })()}
          </p>
          <span style={{ fontSize: '0.7rem', opacity: 0.7, display: 'block', marginTop: '4px' }}>
            {format(new Date(message.timestamp), 'HH:mm')}
          </span>
        </div>
      </div>
    );
  }

  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);
  const statusInfo = getMessageStatus(message, isOwn, isGroupChat, participants, currentUserId);
  const statusColor = statusInfo?.read ? '#4FC3F7' : 'white';
  const isImageMessage = message.type === 'image';
  const showExpand = message.type === 'text' && message.content.length > MAX_PREVIEW_LENGTH;
  const displayContent = showExpand && !isExpanded ? `${message.content.substring(0, MAX_PREVIEW_LENGTH)}...` : message.content;
  const replyQuoteBg = isOwn ? 'rgba(255, 255, 255, 0.16)' : baseTheme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.08)';
  const replyQuoteAccent = isOwn ? 'rgba(255, 255, 255, 0.55)' : theme.primary;

  const replyQuote = message.replyTo && (
    <div
      style={{
        margin: '8px 10px 0',
        padding: '6px 10px',
        minWidth: 0,
        maxWidth: 'calc(100% - 20px)',
        boxSizing: 'border-box',
        background: replyQuoteBg,
        borderLeft: `3px solid ${replyQuoteAccent}`,
        borderRadius: '6px',
        fontSize: '0.8rem',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          opacity: 0.85,
          marginBottom: '2px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {getDisplayName(message.replyTo.sender.id, message.replyTo.sender.nickname, currentUserId)}
      </div>
      {message.replyTo.type === 'image' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', opacity: 0.72 }}>
          <FaImage size={12} style={{ flexShrink: 0 }} />
          <span>Imagem</span>
        </div>
      ) : message.replyTo.type === 'audio' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', opacity: 0.72 }}>
          <FaPlay size={12} style={{ flexShrink: 0 }} />
          <span>Áudio {formatAudioTime(message.replyTo.duration ?? 0)}</span>
        </div>
      ) : (
        <div
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
            minWidth: 0,
            opacity: 0.72,
            lineHeight: 1.35,
          }}
        >
          {message.replyTo.content}
        </div>
      )}
    </div>
  );

  return (
    <BubbleShell
      isOwn={isOwn}
      isGroupChat={isGroupChat}
      roomId={roomId}
      senderId={message.sender.id}
      senderNickname={message.sender.nickname}
      currentUserId={currentUserId}
      onSelect={onSelect}
      padding={isImageMessage ? '4px 0 6px' : isAudioMessage ? '8px 0 6px' : '6px 0'}
      extraClassName={isAudioMessage ? ' is-audio' : ''}
      afterBubble={
        <>
          {receipt && <MessageReceiptRow receipt={receipt} isOwn={isOwn} theme={theme} />}
          {isSelected && <MessageActionsRow isOwn={isOwn} theme={theme} onReply={onReply} onDelete={onDelete} />}
          {isImageMessage && (
            <ImageModal isOpen={isImageModalOpen} images={[message.content]} onClose={() => setIsImageModalOpen(false)} />
          )}
        </>
      }
    >
      {replyQuote}

      {isImageMessage ? (
        <>
          <div style={{ position: 'relative', padding: '0 4px', minWidth: isImageLoaded ? undefined : '220px', minHeight: isImageLoaded ? undefined : '160px' }}>
            {!isImageLoaded && (
              <div
                className="shimmer-bg"
                style={
                  {
                    position: 'absolute',
                    inset: '0 4px',
                    borderRadius: '12px',
                    '--shimmer-a': theme.surfaceLight,
                  } as CSSProperties
                }
              />
            )}
            <img
              src={message.content}
              alt="Imagem enviada"
              onLoad={() => setIsImageLoaded(true)}
              onClick={(event) => {
                event.stopPropagation();
                setIsImageModalOpen(true);
              }}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: '400px',
                borderRadius: '12px',
                cursor: 'pointer',
                opacity: isImageLoaded ? 1 : 0,
                transition: 'opacity 0.25s ease',
              }}
            />
          </div>
        </>
      ) : isAudioMessage ? (
        <div style={{ padding: '2px 10px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              background: isOwn ? 'rgba(255, 255, 255, 0.14)' : baseTheme === 'light' ? '#77777720' : 'rgba(255, 255, 255, 0.07)',
              borderRadius: '12px',
              width: '100%',
              minWidth: '210px',
              maxWidth: '100%',
              boxSizing: 'border-box',
            }}
          >
            <audio
              src={message.content}
              ref={audioElementRef}
              onEnded={handleAudioEnded}
              onLoadedMetadata={(event) => setAudioDuration(event.currentTarget.duration)}
              onTimeUpdate={(event) => setAudioCurrentTime(event.currentTarget.currentTime)}
              style={{ display: 'none' }}
            />

            <button
              onClick={(event) => {
                event.stopPropagation();
                handleAudioToggle();
              }}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                border: 'none',
                background: hasBeenPlayed ? '#2196F3' : '#35dd3bff',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'scale(1.1)';
                event.currentTarget.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'scale(1)';
                event.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.15)';
              }}
            >
              {playbackIcon === 'pause' ? (
                <FaPause size={14} color="white" />
              ) : (
                <FaPlay size={14} color="white" style={{ marginLeft: '2px' }} />
              )}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1, height: '24px', minWidth: '56px', marginLeft: '6px', position: 'relative' }}>
              {audioWaveform.map((level, index) => {
                const isPlayedBar = index < playbackProgress;
                const barHeight = Math.max(3, Math.min(100, level));
                const barColor = hasBeenPlayed
                  ? isPlayedBar
                    ? 'rgba(49, 176, 255, 1)'
                    : 'rgba(255, 255, 255, 1)'
                  : isPlayedBar
                    ? '#48ff2fff'
                    : 'rgba(255, 255, 255, 1)';

                return (
                  <div
                    key={index}
                    style={{
                      flex: 1,
                      height: `${barHeight}%`,
                      background: barColor,
                      borderRadius: '10px',
                      transition: 'all 0.1s ease',
                      minWidth: '2.5px',
                      position: 'relative',
                    }}
                  />
                );
              })}

              <div
                style={{
                  position: 'absolute',
                  left: `${audioDuration ? (audioCurrentTime / audioDuration) * 100 : 0}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: hasBeenPlayed ? '#64c9ffff' : '#00ff08ff',
                  boxShadow: `0 0 8px ${hasBeenPlayed ? '#a5e0ffff' : '#8eff92ff'}`,
                  pointerEvents: 'none',
                  transition: 'left 0.05s linear',
                }}
              />
            </div>

            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: isOwn ? 'rgba(255, 255, 255, 0.8)' : baseTheme === 'light' ? '#555555ff' : '#ffffffc7',
                minWidth: '35px',
                textAlign: 'right',
              }}
            >
              {formatAudioTime(audioDuration)}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ padding: '4px 12px 0', minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.95rem',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              fontWeight: 500,
              wordBreak: 'break-word',
            }}
          >
            {displayContent}
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
                  style={{
                    whiteSpace: 'nowrap',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    color: isOwn ? 'rgba(255, 255, 255, 0.95)' : theme.primary,
                  }}
                >
                  {isExpanded ? 'ver menos' : 'ver mais'}
                </span>
              </>
            )}
          </p>
        </div>
      )}

      <MessageMeta message={message} isOwn={isOwn} textColor={bubbleStyle.textColor} statusInfo={statusInfo} statusColor={statusColor} onRetry={onRetry} />
    </BubbleShell>
  );
}

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
  onRetry,
}: ImageGroupBubbleProps) {
  const { theme, getRoomAppearance } = useTheme();
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const anchor = images[images.length - 1] ?? images[0];
  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);
  const statusInfo = anchor ? getMessageStatus(anchor, isOwn, isGroupChat, participants, currentUserId) : null;
  const statusColor = statusInfo?.read ? '#4FC3F7' : 'white';
  const visibleTiles = images.slice(0, MAX_GROUP_TILES);
  const extraCount = images.length - visibleTiles.length;

  if (!anchor) {
    return null;
  }

  return (
    <BubbleShell
      isOwn={isOwn}
      isGroupChat={isGroupChat}
      roomId={roomId}
      senderId={anchor.sender.id}
      senderNickname={anchor.sender.nickname}
      currentUserId={currentUserId}
      onSelect={onSelect}
      padding="4px 0 6px"
      afterBubble={
        <>
          {receipt && <MessageReceiptRow receipt={receipt} isOwn={isOwn} theme={theme} />}
          {isSelected && <MessageActionsRow isOwn={isOwn} theme={theme} onReply={onReply} onDelete={onDelete} />}
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
          padding: '0 4px',
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
              style={{
                position: 'relative',
                aspectRatio: '1',
                borderRadius: '10px',
                overflow: 'hidden',
                cursor: 'pointer',
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
                    background: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
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

      <MessageMeta message={anchor} isOwn={isOwn} textColor={bubbleStyle.textColor} statusInfo={statusInfo} statusColor={statusColor} onRetry={onRetry} />
    </BubbleShell>
  );
}
