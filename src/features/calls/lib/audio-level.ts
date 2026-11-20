import { keepAudioContextRunning } from './audio-keepalive';

export const LEVEL_INTERVAL_MS = 100;
export const SPEAKING_THRESHOLD = 0.04;
export const SILENCE_THRESHOLD = 0.025;
export const SPEAKING_HOLD_MS = 400;

export function rmsLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centered = ((samples[index] ?? 128) - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / samples.length));
}

export interface SpeakingState {
  speaking: boolean;
  lastLoudAt: number | null;
}

export const QUIET: SpeakingState = { speaking: false, lastLoudAt: null };

export function nextSpeaking(state: SpeakingState, level: number, now: number): SpeakingState {
  if (level >= SPEAKING_THRESHOLD || (state.speaking && level >= SILENCE_THRESHOLD)) {
    return { speaking: true, lastLoudAt: now };
  }
  if (state.speaking && state.lastLoudAt !== null && now - state.lastLoudAt < SPEAKING_HOLD_MS) {
    return state;
  }
  return QUIET;
}

interface AnalyserLike {
  fftSize: number;
  getByteTimeDomainData: (array: Uint8Array<ArrayBuffer>) => void;
  disconnect: () => void;
}

interface SourceLike {
  connect: (node: AnalyserLike) => unknown;
  disconnect: () => void;
}

export interface AudioContextLike {
  state?: string;
  createMediaStreamSource: (stream: MediaStream) => SourceLike;
  createAnalyser: () => AnalyserLike;
  resume?: () => Promise<void>;
  close: () => Promise<void>;
}

export interface SpeakingMonitorDeps {
  createContext: () => AudioContextLike | null;
  now: () => number;
  setInterval: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (timer: ReturnType<typeof setInterval>) => void;
}

function defaultCreateContext(): AudioContextLike | null {
  const Context = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Context) {
    return null;
  }
  try {
    return new Context() as unknown as AudioContextLike;
  } catch {
    return null;
  }
}

const defaultDeps: SpeakingMonitorDeps = {
  createContext: defaultCreateContext,
  now: () => Date.now(),
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (timer) => clearInterval(timer),
};

function connectAnalyser(context: AudioContextLike, stream: MediaStream): { source: SourceLike; analyser: AnalyserLike } | null {
  try {
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    return { source, analyser };
  } catch {
    return null;
  }
}

export function monitorSpeaking(stream: MediaStream, onChange: (speaking: boolean) => void, deps: Partial<SpeakingMonitorDeps> = {}): () => void {
  const resolved = { ...defaultDeps, ...deps };
  if (stream.getAudioTracks().length === 0) {
    return () => undefined;
  }
  const context = resolved.createContext();
  if (!context) {
    return () => undefined;
  }
  const nodes = connectAnalyser(context, stream);
  if (!nodes) {
    void context.close().catch(() => undefined);
    return () => undefined;
  }
  const { source, analyser } = nodes;
  const release = keepAudioContextRunning(context);
  const buffer = new Uint8Array(analyser.fftSize);
  let state = QUIET;
  const meter = analyser;
  const timer = resolved.setInterval(() => {
    meter.getByteTimeDomainData(buffer);
    const next = nextSpeaking(state, rmsLevel(buffer), resolved.now());
    if (next.speaking !== state.speaking) {
      onChange(next.speaking);
    }
    state = next;
  }, LEVEL_INTERVAL_MS);
  let stopped = false;
  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    resolved.clearInterval(timer);
    release();
    try {
      source.disconnect();
      meter.disconnect();
    } catch {
      return;
    } finally {
      void context.close().catch(() => undefined);
    }
  };
}
