import { keepAudioContextRunning } from './audio-keepalive';
import { onPageResume } from './page-resume';

export const CALL_VOLUME_MIN = 0;
export const CALL_VOLUME_MAX = 2;

export function clampCallVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(CALL_VOLUME_MAX, Math.max(CALL_VOLUME_MIN, value)) : 1;
}

export interface PlaybackPlan {
  boosted: boolean;
  elementVolume: number;
  gain: number;
}

export function playbackPlan(volume: number): PlaybackPlan {
  const clamped = clampCallVolume(volume);
  return clamped > 1 ? { boosted: true, elementVolume: 1, gain: clamped } : { boosted: false, elementVolume: clamped, gain: 1 };
}

interface GainLike {
  gain: { value: number; setTargetAtTime?: (value: number, start: number, constant: number) => unknown };
  connect: (node: unknown) => unknown;
  disconnect: () => void;
}

interface LimiterLike {
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  connect: (node: unknown) => unknown;
  disconnect: () => void;
}

export const PLAYBACK_LIMITER = { threshold: -1, knee: 0, ratio: 20, attack: 0.001, release: 0.1 } as const;

export interface PlaybackContextLike {
  state?: string;
  resume?: () => Promise<void>;
  addEventListener?: (type: 'statechange', listener: () => void) => void;
  removeEventListener?: (type: 'statechange', listener: () => void) => void;
  currentTime?: number;
  createMediaStreamSource: (stream: MediaStream) => { connect: (node: GainLike) => unknown; disconnect: () => void };
  createGain: () => GainLike;
  createDynamicsCompressor?: () => LimiterLike;
  createMediaStreamDestination: () => { stream: MediaStream; disconnect?: () => void };
  close: () => Promise<void>;
}

export interface KeepAliveLike {
  srcObject: MediaProvider | null;
  muted: boolean;
  paused?: boolean;
  play: () => Promise<void>;
  pause: () => void;
}

export interface PlaybackBoostDeps {
  createContext: () => PlaybackContextLike | null;
  createKeepAlive: () => KeepAliveLike | null;
}

export interface PlaybackBoost {
  stream: MediaStream;
  setGain: (gain: number) => void;
  stop: () => void;
}

function browserContext(): PlaybackContextLike | null {
  const Context = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Context) {
    return null;
  }
  try {
    return new Context({ latencyHint: 'interactive' }) as unknown as PlaybackContextLike;
  } catch {
    return null;
  }
}

function browserKeepAlive(): KeepAliveLike | null {
  try {
    return typeof Audio === 'undefined' ? null : new Audio();
  } catch {
    return null;
  }
}

const defaultDeps: PlaybackBoostDeps = { createContext: browserContext, createKeepAlive: browserKeepAlive };

export function createPlaybackBoost(stream: MediaStream, gainValue: number, deps: Partial<PlaybackBoostDeps> = {}): PlaybackBoost | null {
  const resolved = { ...defaultDeps, ...deps };
  const context = resolved.createContext();
  if (!context) {
    return null;
  }
  if (context.state !== 'running') {
    void context.close().catch(() => undefined);
    return null;
  }
  try {
    const source = context.createMediaStreamSource(stream);
    const gain = context.createGain();
    const destination = context.createMediaStreamDestination();
    gain.gain.value = clampCallVolume(gainValue);
    const limiter = context.createDynamicsCompressor?.() ?? null;
    source.connect(gain);
    if (limiter) {
      limiter.threshold.value = PLAYBACK_LIMITER.threshold;
      limiter.knee.value = PLAYBACK_LIMITER.knee;
      limiter.ratio.value = PLAYBACK_LIMITER.ratio;
      limiter.attack.value = PLAYBACK_LIMITER.attack;
      limiter.release.value = PLAYBACK_LIMITER.release;
      gain.connect(limiter);
      limiter.connect(destination);
    } else {
      gain.connect(destination);
    }
    const keepAlive = resolved.createKeepAlive();
    if (keepAlive) {
      keepAlive.muted = true;
      keepAlive.srcObject = stream;
      void keepAlive.play().catch(() => undefined);
    }
    const releaseContext = keepAudioContextRunning(context);
    const stopResume = onPageResume(() => {
      if (keepAlive && keepAlive.paused !== false) {
        void keepAlive.play().catch(() => undefined);
      }
    });
    let stopped = false;
    return {
      stream: destination.stream,
      setGain: (next) => {
        if (stopped) {
          return;
        }
        const target = clampCallVolume(next);
        if (gain.gain.setTargetAtTime && typeof context.currentTime === 'number') {
          gain.gain.setTargetAtTime(target, context.currentTime, 0.05);
        } else {
          gain.gain.value = target;
        }
      },
      stop: () => {
        if (stopped) {
          return;
        }
        stopped = true;
        releaseContext();
        stopResume();
        try {
          source.disconnect();
          gain.disconnect();
          limiter?.disconnect();
        } catch {
          return;
        } finally {
          if (keepAlive) {
            keepAlive.pause();
            keepAlive.srcObject = null;
          }
          void context.close().catch(() => undefined);
        }
      },
    };
  } catch {
    void context.close().catch(() => undefined);
    return null;
  }
}
