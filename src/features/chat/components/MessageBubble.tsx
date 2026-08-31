import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { format } from 'date-fns';
import { FaBan, FaCheck, FaImage, FaPause, FaPlay, FaReply, FaTrash } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import type { RoomParticipant } from '@features/rooms';
import { formatAudioTime, getDisplayName, processSystemMessage } from '@lib/format';
import { getMessageStatus } from '@lib/message-status';
import type { MessageView } from '@lib/socket';
import { useAudioWaveform } from '../hooks/useAudioWaveform';
import { ImageModal } from './ImageModal';

export interface CurrentAudioRef {
  id: string;
  element: HTMLAudioElement;
  setIcon: (icon: 'play' | 'pause') => void;
}

interface MessageBubbleProps {
  message: MessageView;
  isOwn: boolean;
  isGroupChat: boolean;
  participants: RoomParticipant[];
  currentUserId: string | undefined;
  currentNickname: string;
  isSelected: boolean;
  currentAudioRef: MutableRefObject<CurrentAudioRef | null>;
  onSelect: () => void;
  onReply: () => void;
  onDelete: () => void;
  onAudioPlayed: (messageId: string) => void;
}

const MAX_PREVIEW_LENGTH = 200;
const WAVEFORM_BAR_COUNT = 40;

export function MessageBubble({
  message,
  isOwn,
  isGroupChat,
  participants,
  currentUserId,
  currentNickname,
  isSelected,
  currentAudioRef,
  onSelect,
  onReply,
  onDelete,
  onAudioPlayed,
}: MessageBubbleProps) {
  const { theme, baseTheme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
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
    return (
      <div
        className="animate__animated animate__fadeInUp animate__faster"
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-end',
          maxWidth: '60%',
          alignSelf: isOwn ? 'flex-end' : 'flex-start',
          marginBottom: '7px',
        }}
      >
        <div
          style={{
            margin: '7px 0',
            background: theme.background,
            color: theme.text,
            borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            padding: '12px 16px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
            fontStyle: 'italic',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FaBan size={14} />
          <p style={{ margin: 0 }}>Mensagem deletada</p>
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
          <p style={{ margin: 0, lineHeight: 1.4 }}>{processSystemMessage(message.content, currentNickname)}</p>
          <span style={{ fontSize: '0.7rem', opacity: 0.7, display: 'block', marginTop: '4px' }}>
            {format(new Date(message.timestamp), 'HH:mm')}
          </span>
        </div>
      </div>
    );
  }

  const statusInfo = getMessageStatus(message, isOwn, isGroupChat, participants, currentUserId);
  const statusColor = statusInfo?.read ? '#4FC3F7' : 'white';
  const isImageMessage = message.type === 'image';
  const usesMediaPadding = isImageMessage || isAudioMessage;
  const showExpand = message.type === 'text' && message.content.length > MAX_PREVIEW_LENGTH;
  const displayContent = showExpand && !isExpanded ? `${message.content.substring(0, MAX_PREVIEW_LENGTH)}...` : message.content;

  return (
    <div
      className="animate__animated animate__fadeInUp animate__faster"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        alignItems: isOwn ? 'flex-end' : 'flex-start',
        maxWidth: '60%',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: '7px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexDirection: isOwn ? 'row-reverse' : 'row' }}>
        <div
          style={{
            background: isOwn ? theme.messageOwn : theme.messageOther,
            color: isOwn ? theme.messageOwnText : theme.messageOtherText,
            borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            padding: usesMediaPadding ? '12px 16px 10px 16px' : '0 16px 10px 16px',
            boxShadow: isOwn ? '0 2px 10px rgba(0, 0, 0, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.08)',
            wordBreak: 'break-word',
          }}
        >
          {!isOwn && isGroupChat && (
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: theme.primary, margin: '12px 0 4px 3px' }}>
              {getDisplayName(message.sender.id, message.sender.nickname, currentUserId)}
            </div>
          )}

          {message.replyTo && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                borderLeft: `3px solid ${isOwn ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}`,
                padding: '8px 40px 12px 12px',
                marginBottom: '8px',
                borderRadius: '4px',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ fontWeight: 600, opacity: 0.8 }}>
                {getDisplayName(message.replyTo.sender.id, message.replyTo.sender.nickname, currentUserId)}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  opacity: 0.7,
                }}
              >
                {message.replyTo.type === 'image' ? (
                  <>
                    <FaImage size={12} style={{ flexShrink: 0 }} />
                    <span>Imagem</span>
                  </>
                ) : message.replyTo.type === 'audio' ? (
                  <>
                    <FaPlay size={12} style={{ flexShrink: 0 }} />
                    <span>Áudio {formatAudioTime(message.replyTo.duration ?? 0)}</span>
                  </>
                ) : (
                  message.replyTo.content
                )}
              </div>
            </div>
          )}

          <div style={{ margin: '10px 6px 6px 6px' }}>
            {isImageMessage ? (
              <img
                src={message.content}
                alt="Imagem enviada"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsImageModalOpen(true);
                }}
                style={{
                  maxWidth: '100%',
                  maxHeight: '400px',
                  borderRadius: '12px',
                  display: 'block',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                }}
              />
            ) : isAudioMessage ? (
              <div
                style={{
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 12px',
                  background: isOwn ? 'rgba(255, 255, 255, 0.14)' : baseTheme === 'light' ? '#77777720' : 'rgba(255, 255, 255, 0.07)',
                  borderRadius: '12px',
                  width: '100%',
                  minWidth: '240px',
                  maxWidth: '280px',
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
                    marginRight: '8px',
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

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    flex: 1,
                    height: '24px',
                    minWidth: '80px',
                    position: 'relative',
                  }}
                >
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
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.95rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    fontWeight: 500,
                    wordBreak: 'break-word',
                  }}
                >
                  {displayContent}
                </p>
                {showExpand && (
                  <button
                    onClick={() => setIsExpanded((previous) => !previous)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: theme.primary,
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      padding: '4px 0',
                      alignSelf: 'flex-start',
                      borderBottom: `2px solid ${theme.primary}`,
                    }}
                  >
                    {isExpanded ? '↑ Ver menos' : '↓ Ver mais'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', width: '100%' }}>
            <span
              style={{
                fontSize: '0.7rem',
                opacity: 0.6,
                color: isOwn ? theme.messageOwnText : theme.messageOtherText,
                fontWeight: 500,
              }}
            >
              {format(new Date(message.timestamp), 'HH:mm')}
            </span>
            {statusInfo && (
              <div style={{ display: 'flex', alignItems: 'center', opacity: isOwn ? 0.9 : 0.7, marginLeft: '6px' }}>
                {statusInfo.icon === 'double' ? (
                  <>
                    <FaCheck size={11} color={statusColor} style={{ marginLeft: '-6px' }} />
                    <FaCheck size={11} color={statusColor} style={{ marginLeft: '-6px' }} />
                  </>
                ) : (
                  <FaCheck size={11} color={statusColor} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isSelected && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            right: isOwn ? 'auto' : '-55px',
            left: isOwn ? '-100px' : 'auto',
            display: 'flex',
            gap: '8px',
            zIndex: 1000,
          }}
        >
          <button
            onClick={(event) => {
              event.stopPropagation();
              onReply();
            }}
            title="Responder"
            style={{
              background: theme.primary,
              opacity: 0.6,
              border: 'none',
              color: 'white',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '0.9rem',
              padding: 0,
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = theme.secondary;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = theme.primary;
            }}
          >
            <FaReply size={14} />
          </button>

          {isOwn && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              title="Deletar para todos"
              style={{
                background: '#ef5350',
                opacity: 0.6,
                border: 'none',
                color: 'white',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.9rem',
                padding: 0,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = '#d32f2f';
                event.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = '#ef5350';
                event.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <FaTrash size={14} />
            </button>
          )}
        </div>
      )}

      {isImageMessage && (
        <ImageModal isOpen={isImageModalOpen} imageSrc={message.content} onClose={() => setIsImageModalOpen(false)} />
      )}
    </div>
  );
}
