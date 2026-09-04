import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { format } from 'date-fns';
import {
  FaBan,
  FaCheck,
  FaDownload,
  FaExclamationCircle,
  FaExpand,
  FaImage,
  FaPause,
  FaPlay,
  FaRegClock,
  FaReply,
  FaShare,
  FaTrash,
} from 'react-icons/fa';
import { IconPillButton } from '@components/common/IconPillButton';
import { AVATARS } from '@features/auth/constants/avatars';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import type { ThemePalette } from '@features/theme';
import type { RoomParticipant } from '@features/rooms';
import { downloadFromUrl } from '@lib/download-file';
import { formatAudioTime, formatFileSize, getDisplayName, processSystemMessage, splitSystemMessageActor } from '@lib/format';
import { getMessageStatus, type MessageReceiptInfo } from '@lib/message-status';
import type { ChatMessage } from '../types';
import { useAudioWaveform } from '../hooks/useAudioWaveform';
import { useReplyVideoThumbnail } from '../hooks/useReplyVideoThumbnail';
import { clampAspectRatio } from '../utils/clamp-aspect-ratio';
import { getFileTypeIcon } from '../utils/get-file-type-icon';
import { renderPdfThumbnail, type PdfThumbnail } from '../utils/render-pdf-thumbnail';
import { renderVideoThumbnail, type VideoThumbnail } from '../utils/render-video-thumbnail';
import { ImageModal } from './ImageModal';
import { PdfPreviewModal } from './PdfPreviewModal';
import { VideoPreviewModal } from './VideoPreviewModal';

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
  onForward: () => void;
  onAudioPlayed: (messageId: string) => void;
  onRetry: () => void;
}

const MAX_PREVIEW_LENGTH = 200;
const WAVEFORM_BAR_COUNT = 40;
const PLAYBACK_RATES = [1, 1.5, 2];
const PDF_THUMBNAIL_WIDTH = 380;
const VIDEO_THUMBNAIL_WIDTH = 380;
const CHAT_ATTACHMENT_MAX_WIDTH = 380;
const CHAT_FILE_CARD_MAX_WIDTH = 280;
const CHAT_ATTACHMENT_MIN_RATIO = 0.8;
const CHAT_ATTACHMENT_MAX_RATIO = 1.91;
const REPLY_QUOTE_HEIGHT = 52;
const MENTION_TOKEN_PATTERN = /(@[\p{L}\p{N}_]+)/gu;

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
  onForward: () => void;
}

export function MessageActionsRow({ isOwn, theme, onReply, onDelete, onForward }: MessageActionsRowProps) {
  return (
    <div className="animate__animated animate__fadeIn animate__faster" style={{ display: 'flex', gap: '8px', margin: '3px 0' }}>
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

      <IconPillButton
        onClick={(event) => {
          event.stopPropagation();
          onForward();
        }}
        background={theme.surface}
        textColor={theme.text}
        icon={<FaShare size={11} />}
        iconBackground={`${theme.primary}26`}
        iconColor={theme.primary}
        label="Encaminhar"
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
  messageId: string;
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
  messageId,
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
        data-message-id={messageId}
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
          minWidth: '80px',
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
  onForward,
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
  const [playbackRate, setPlaybackRate] = useState(1);
  const [pdfThumbnail, setPdfThumbnail] = useState<PdfThumbnail | null>(null);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [videoThumbnail, setVideoThumbnail] = useState<VideoThumbnail | null>(null);
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);
  const [imageDisplayHeight, setImageDisplayHeight] = useState<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isAudioMessage = message.type === 'audio';
  const audioWaveform = useAudioWaveform(isAudioMessage ? message.content : null);
  const isPdfFile = message.type === 'file' && message.fileMeta?.mimeType === 'application/pdf';
  const isVideoFile = message.type === 'file' && Boolean(message.fileMeta?.mimeType.startsWith('video/'));
  const isReplyToImage = message.replyTo?.type === 'image';
  const isReplyToVideo = message.replyTo?.type === 'file' && Boolean(message.replyTo.fileMeta?.mimeType.startsWith('video/'));

  useEffect(() => {
    if (!isPdfFile) {
      return;
    }

    let cancelled = false;
    renderPdfThumbnail(message.content, PDF_THUMBNAIL_WIDTH)
      .then((thumbnail) => {
        if (!cancelled) {
          setPdfThumbnail(thumbnail);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isPdfFile, message.content]);

  useEffect(() => {
    if (!isVideoFile) {
      return;
    }

    let cancelled = false;
    renderVideoThumbnail(message.content, VIDEO_THUMBNAIL_WIDTH)
      .then((thumbnail) => {
        if (!cancelled) {
          setVideoThumbnail(thumbnail);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isVideoFile, message.content]);

  const replyVideoThumbnail = useReplyVideoThumbnail(isReplyToVideo, message.replyTo?.content);

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

  const handleCyclePlaybackRate = () => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length] ?? 1;
    setPlaybackRate(nextRate);
    if (audioElementRef.current) {
      audioElementRef.current.playbackRate = nextRate;
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

  if (message.type === 'error') {
    return (
      <div
        className="animate__animated animate__fadeIn"
        style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '4px 0' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            background: 'rgba(239, 83, 80, 0.14)',
            border: '1px solid rgba(239, 83, 80, 0.35)',
            color: '#ef5350',
            borderRadius: '12px',
            padding: '8px 16px',
            fontSize: '0.85rem',
            textAlign: 'left',
            maxWidth: '80%',
            fontWeight: 500,
          }}
        >
          <FaExclamationCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ margin: 0, lineHeight: 1.4 }}>{message.content}</p>
            <span style={{ fontSize: '0.7rem', opacity: 0.75, display: 'block', marginTop: '2px' }}>
              {format(new Date(message.timestamp), 'HH:mm')}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (message.type === 'system') {
    return (
      <div
        className="animate__animated animate__fadeIn"
        style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '4px 0' }}
      >
        <div
          style={{
            background: `${theme.primary}A0`,
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
  const isFileMessage = message.type === 'file';
  const fileTypeIcon = isFileMessage ? getFileTypeIcon(message.fileMeta?.mimeType ?? '') : null;
  const showExpand = message.type === 'text' && message.content.length > MAX_PREVIEW_LENGTH;
  const displayContent = showExpand && !isExpanded ? `${message.content.substring(0, MAX_PREVIEW_LENGTH)}...` : message.content;
  const replyQuoteBg = isOwn ? 'rgba(0, 0, 0, 0.14)' : baseTheme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.08)';
  const replyQuoteAccent = isOwn ? 'rgba(255, 255, 255, 0.55)' : theme.primary;

  const handleJumpToReply = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    if (!message.replyTo) {
      return;
    }
    const target = document.querySelector(`[data-message-id="${message.replyTo.id}"]`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('message-highlight-flash');
    setTimeout(() => target.classList.remove('message-highlight-flash'), 1500);
  };

  const replyThumbnailUrl = isReplyToImage ? message.replyTo?.content : isReplyToVideo ? replyVideoThumbnail : null;

  const replyQuote = message.replyTo && (
    <div
      onClick={handleJumpToReply}
      style={{
        margin: '8px 10px 0',
        marginBottom: message.type === 'text' ? 0 : '6px',
        minWidth: '160px',
        maxWidth: 'calc(100% - 20px)',
        boxSizing: 'border-box',
        background: replyQuoteBg,
        borderLeft: `3px solid ${replyQuoteAccent}`,
        borderRadius: '6px',
        fontSize: '0.8rem',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'stretch',
        gap: '8px',
        overflow: 'hidden',
        height: isReplyToImage || isReplyToVideo ? `${REPLY_QUOTE_HEIGHT}px` : undefined,
      }}
    >
      <div
        style={{
          minWidth: 0,
          flex: 1,
          padding: isReplyToImage || isReplyToVideo ? '0 0 0 10px' : '6px 0 6px 10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
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
        ) : message.replyTo.type === 'file' ? (
          (() => {
            const replyFileIcon = getFileTypeIcon(message.replyTo.fileMeta?.mimeType ?? '');
            const ReplyFileIcon = replyFileIcon.icon;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', opacity: 0.72 }}>
                {!isReplyToVideo && <ReplyFileIcon size={12} style={{ flexShrink: 0 }} />}
                <span style={{ display: 'inline-block', maxWidth: '172px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {message.replyTo.fileMeta?.name ?? replyFileIcon.label}
                </span>
              </div>
            );
          })()
        ) : (
          <div
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              wordBreak: 'break-word',
              minWidth: 0,
              opacity: 0.72,
            }}
          >
            {message.replyTo.content}
          </div>
        )}
      </div>
      {(isReplyToImage || isReplyToVideo) && (
        <div
          style={{
            width: `${REPLY_QUOTE_HEIGHT}px`,
            height: `${REPLY_QUOTE_HEIGHT}px`,
            flexShrink: 0,
            background: 'rgba(0, 0, 0, 0.25)',
          }}
        >
          {replyThumbnailUrl && <img src={replyThumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
      )}
    </div>
  );

  return (
    <BubbleShell
      isOwn={isOwn}
      isGroupChat={isGroupChat}
      roomId={roomId}
      messageId={message.id}
      senderId={message.sender.id}
      senderNickname={message.sender.nickname}
      currentUserId={currentUserId}
      onSelect={onSelect}
      padding={isImageMessage || isVideoFile ? '4px 0 6px' : isAudioMessage ? '8px 0 6px' : isFileMessage ? '10px 0 6px' : '6px 0'}
      extraClassName={isAudioMessage ? ' is-audio' : ''}
      afterBubble={
        <>
          {receipt && <MessageReceiptRow receipt={receipt} isOwn={isOwn} theme={theme} />}
          {isSelected && (
            <MessageActionsRow isOwn={isOwn} theme={theme} onReply={onReply} onDelete={onDelete} onForward={onForward} />
          )}
          {isImageMessage && (
            <ImageModal isOpen={isImageModalOpen} images={[message.content]} onClose={() => setIsImageModalOpen(false)} />
          )}
        </>
      }
    >
      {replyQuote}

      {isImageMessage ? (
        <>
          <div
            style={{
              position: 'relative',
              padding: '0 4px',
              width: isImageLoaded ? `${CHAT_ATTACHMENT_MAX_WIDTH}px` : undefined,
              maxWidth: '100%',
              height: imageDisplayHeight ?? undefined,
              minWidth: isImageLoaded ? undefined : '220px',
              minHeight: isImageLoaded ? undefined : '160px',
            }}
          >
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
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                const ratio = clampAspectRatio(naturalWidth, naturalHeight, CHAT_ATTACHMENT_MIN_RATIO, CHAT_ATTACHMENT_MAX_RATIO);
                setImageDisplayHeight(Math.round(CHAT_ATTACHMENT_MAX_WIDTH / ratio));
                setIsImageLoaded(true);
              }}
              onClick={(event) => {
                event.stopPropagation();
                setIsImageModalOpen(true);
              }}
              style={{
                display: 'block',
                width: isImageLoaded ? '100%' : undefined,
                height: isImageLoaded ? '100%' : undefined,
                objectFit: isImageLoaded ? 'cover' : undefined,
                maxWidth: isImageLoaded ? undefined : `min(100%, ${CHAT_ATTACHMENT_MAX_WIDTH}px)`,
                maxHeight: isImageLoaded ? undefined : '470px',
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

            <button
              onClick={(event) => {
                event.stopPropagation();
                handleCyclePlaybackRate();
              }}
              style={{
                background: isOwn ? 'rgba(255, 255, 255, 0.18)' : baseTheme === 'light' ? '#77777730' : 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                borderRadius: '50%',
                color: isOwn ? 'white' : baseTheme === 'light' ? '#555555ff' : '#ffffffc7',
                cursor: 'pointer',
                fontSize: '0.62rem',
                fontWeight: 700,
                width: '30px',
                height: '30px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      ) : isVideoFile ? (
        <div style={{ padding: '0 4px' }}>
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'relative',
              width: videoThumbnail ? `${CHAT_ATTACHMENT_MAX_WIDTH}px` : '100%',
              maxWidth: '100%',
              height: videoThumbnail
                ? Math.round(
                    CHAT_ATTACHMENT_MAX_WIDTH /
                      clampAspectRatio(videoThumbnail.width, videoThumbnail.height, CHAT_ATTACHMENT_MIN_RATIO, CHAT_ATTACHMENT_MAX_RATIO),
                  )
                : undefined,
              minHeight: videoThumbnail ? undefined : '160px',
              borderRadius: '12px',
              background: '#000',
              overflow: 'hidden',
            }}
          >
            <video
              src={message.content}
              controls
              poster={videoThumbnail?.dataUrl}
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <button
              onClick={(event) => {
                event.stopPropagation();
                setIsVideoPreviewOpen(true);
              }}
              title="Abrir em tela cheia"
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.55)',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'auto',
              }}
            >
              <FaExpand size={12} />
            </button>
          </div>
          <VideoPreviewModal
            isOpen={isVideoPreviewOpen}
            onClose={() => setIsVideoPreviewOpen(false)}
            url={message.content}
            fileName={message.fileMeta?.name ?? 'Vídeo.mp4'}
          />
        </div>
      ) : isFileMessage && fileTypeIcon ? (
        <div style={{ padding: '0 9px' }}>
          <div
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              if (isPdfFile) {
                setIsPdfPreviewOpen(true);
              } else {
                void downloadFromUrl(message.content, message.fileMeta?.name ?? 'arquivo');
              }
            }}
            style={{
              borderRadius: '12px',
              background: isOwn ? 'rgba(255, 255, 255, 0.14)' : baseTheme === 'light' ? '#77777720' : 'rgba(255, 255, 255, 0.07)',
              cursor: 'pointer',
              width: '100%',
              minWidth: '230px',
              maxWidth: `${CHAT_FILE_CARD_MAX_WIDTH}px`,
              overflow: 'hidden',
            }}
          >
            {isPdfFile && pdfThumbnail && (
              <img
                src={pdfThumbnail.dataUrl}
                alt="Prévia do PDF"
                style={{
                  display: 'block',
                  width: '100%',
                  maxHeight: '70px',
                  objectFit: 'cover',
                  objectPosition: 'top',
                  borderBottom: `1px solid ${isOwn ? 'rgba(255, 255, 255, 0.2)' : theme.border}`,
                }}
              />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: `${fileTypeIcon.color}22`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <fileTypeIcon.icon size={15} color={fileTypeIcon.color} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: isOwn ? 'white' : theme.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {message.fileMeta?.name ?? 'Arquivo'}
                </div>
                <div
                  style={{
                    fontSize: '0.65rem',
                    color: isOwn ? 'rgba(255, 255, 255, 0.75)' : theme.textSecondary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isPdfFile && pdfThumbnail ? `${pdfThumbnail.pageCount} página${pdfThumbnail.pageCount === 1 ? '' : 's'} · ` : `${fileTypeIcon.label} · `}
                  {message.fileMeta ? formatFileSize(message.fileMeta.size) : ''}
                </div>
              </div>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void downloadFromUrl(message.content, message.fileMeta?.name ?? 'arquivo');
                }}
                title="Baixar arquivo"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexShrink: 0,
                }}
              >
                <FaDownload size={14} color={isOwn ? 'white' : theme.textSecondary} />
              </button>
            </div>
          </div>
          {isPdfFile && (
            <PdfPreviewModal
              isOpen={isPdfPreviewOpen}
              onClose={() => setIsPdfPreviewOpen(false)}
              url={message.content}
              fileName={message.fileMeta?.name ?? 'Documento.pdf'}
            />
          )}
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
            {renderMessageContent(displayContent, participants, isOwn ? 'rgba(255, 255, 255, 0.95)' : theme.primary)}
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

      {message.type !== 'text' && message.caption && (
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
            {message.caption}
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
      messageId={anchor.id}
      senderId={anchor.sender.id}
      senderNickname={anchor.sender.nickname}
      currentUserId={currentUserId}
      onSelect={onSelect}
      padding="4px 0 6px"
      afterBubble={
        <>
          {receipt && <MessageReceiptRow receipt={receipt} isOwn={isOwn} theme={theme} />}
          {isSelected && (
            <MessageActionsRow isOwn={isOwn} theme={theme} onReply={onReply} onDelete={onDelete} onForward={onForward} />
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
