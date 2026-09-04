import { useEffect, useRef, useState, type RefObject } from 'react';
import { FaPause, FaPlay } from 'react-icons/fa';
import { formatAudioTime } from '@lib/format';
import { useAudioWaveform } from '../hooks/useAudioWaveform';
import type { ChatMessage } from '../types';
import { resolveBubbleInnerPalette } from '../utils/bubble-palette';

export interface CurrentAudioRef {
  id: string;
  element: HTMLAudioElement;
  setIcon: (icon: 'play' | 'pause') => void;
}

interface AudioMessageContentProps {
  message: ChatMessage;
  isOwn: boolean;
  baseTheme: string;
  currentUserId: string | undefined;
  currentAudioRef: RefObject<CurrentAudioRef | null>;
  onAudioPlayed: (messageId: string) => void;
}

const WAVEFORM_BAR_COUNT = 40;
const PLAYBACK_RATES = [1, 1.5, 2];

export function AudioMessageContent({ message, isOwn, baseTheme, currentUserId, currentAudioRef, onAudioPlayed }: AudioMessageContentProps) {
  const [playbackIcon, setPlaybackIcon] = useState<'play' | 'pause'>('play');
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [hasBeenPlayed, setHasBeenPlayed] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioWaveform = useAudioWaveform(message.content);
  const innerPalette = resolveBubbleInnerPalette(isOwn, baseTheme);

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

  return (
    <div style={{ padding: '2px 10px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          background: innerPalette.background,
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
            color: innerPalette.secondaryText,
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
            background: innerPalette.iconBackground,
            border: 'none',
            borderRadius: '50%',
            color: isOwn ? 'white' : innerPalette.secondaryText,
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
  );
}
