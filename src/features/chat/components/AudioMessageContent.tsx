import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { FaPause, FaPlay } from 'react-icons/fa';
import { useTheme, withAlpha, type ResolvedBubbleStyle } from '@features/theme';
import { formatAudioTime } from '@lib/format';
import { useAudioWaveform } from '../hooks/useAudioWaveform';
import type { ChatMessage } from '../types';
import { CHAT_ATTACHMENT_MAX_WIDTH } from '../utils/chat-attachment-layout';

export interface CurrentAudioRef {
  id: string;
  element: HTMLAudioElement;
  setIcon: (icon: 'play' | 'pause') => void;
}

interface AudioMessageContentProps {
  message: ChatMessage;
  isOwn: boolean;
  bubble: ResolvedBubbleStyle;
  currentUserId: string | undefined;
  currentAudioRef: RefObject<CurrentAudioRef | null>;
  onAudioPlayed: (messageId: string) => void;
}

const WAVEFORM_BAR_COUNT = 32;
const PLAYBACK_RATES = [1, 1.5, 2];
const AUDIO_BUBBLE_WIDTH = CHAT_ATTACHMENT_MAX_WIDTH + 24;

export function AudioMessageContent({ message, isOwn, bubble, currentUserId, currentAudioRef, onAudioPlayed }: AudioMessageContentProps) {
  const { theme } = useTheme();
  const [playbackIcon, setPlaybackIcon] = useState<'play' | 'pause'>('play');
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [hasBeenPlayed, setHasBeenPlayed] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioWaveform = useAudioWaveform(message.content);

  useEffect(() => {
    setHasBeenPlayed(isOwn ? message.playedBy.length > 0 : message.playedBy.includes(currentUserId ?? ''));
  }, [isOwn, message.playedBy, currentUserId]);

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

  const stopProgressAnimation = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const handleAudioToggle = () => {
    const audio = audioElementRef.current;
    if (!audio) {
      return;
    }

    if (playbackIcon === 'pause') {
      audio.pause();
      setPlaybackIcon('play');
      stopProgressAnimation();
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
    stopProgressAnimation();
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

  const stateColor = hasBeenPlayed ? theme.audioPlayed : theme.audioFresh;
  const idleBarColor = withAlpha(bubble.textColor, 0.55);

  return (
    <div style={{ padding: '2px 10px 0' }}>
      <div
        style={
          {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            background: bubble.innerBackground,
            borderRadius: '12px',
            width: `${AUDIO_BUBBLE_WIDTH}px`,
            maxWidth: '100%',
            boxSizing: 'border-box',
            '--sc-bubble-inner-strong': bubble.innerStrongBackground,
            '--sc-bubble-text': bubble.textColor,
          } as CSSProperties
        }
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
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleAudioToggle();
          }}
          title={playbackIcon === 'pause' ? 'Pausar' : 'Reproduzir'}
          className="sc-icon-btn sc-icon-btn--audio"
          style={{ width: '32px', height: '32px', flexShrink: 0, background: stateColor }}
        >
          {playbackIcon === 'pause' ? <FaPause size={15} /> : <FaPlay size={14} style={{ marginLeft: '3px' }} />}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1px', flex: 1, height: '24px', minWidth: '60px', position: 'relative', marginLeft: '6px' }}>
          {audioWaveform.map((level, index) => {
            const isPlayedBar = index < playbackProgress;
            const barHeight = Math.max(12, Math.min(100, level));

            return (
              <div
                key={index}
                style={{
                  flexShrink: 0,
                  width: '1.5px',
                  height: `${barHeight}%`,
                  background: isPlayedBar ? stateColor : idleBarColor,
                  borderRadius: '50%',
                  transition: 'background 0.1s ease',
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
              background: stateColor,
              boxShadow: `0 0 8px ${withAlpha(stateColor, 0.8)}`,
              pointerEvents: 'none',
              transition: 'left 0.05s linear',
            }}
          />
        </div>

        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: bubble.mutedTextColor,
            minWidth: '38px',
            flexShrink: 0,
            textAlign: 'right',
          }}
        >
          {formatAudioTime(audioDuration)}
        </span>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleCyclePlaybackRate();
          }}
          title="Velocidade de reprodução"
          className="sc-icon-btn sc-icon-btn--bubble"
          style={{ fontSize: '0.65rem', fontWeight: 700, width: '30px', height: '30px', flexShrink: 0 }}
        >
          {playbackRate}x
        </button>
      </div>
    </div>
  );
}
