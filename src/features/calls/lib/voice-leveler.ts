export const MAKEUP_GAIN_DB = 6;
export const MIC_VOLUME_MIN = 0.5;
export const MIC_VOLUME_MAX = 2;
export const HIGHPASS_HZ = 80;
export const GAIN_SMOOTHING_S = 0.05;
export const OUTPUT_TRIM_DB = -1.2;

export const COMPRESSOR = { threshold: -26, knee: 12, ratio: 3.5, attack: 0.003, release: 0.25 } as const;
export const LIMITER = { threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.1 } as const;

interface ParamLike {
  value: number;
  setTargetAtTime?: (value: number, start: number, constant: number) => unknown;
}

export interface VoiceNodeLike {
  connect: (node: VoiceNodeLike) => unknown;
  disconnect: () => void;
}

export interface BiquadLike extends VoiceNodeLike {
  type: string;
  frequency: ParamLike;
  Q: ParamLike;
}

export interface CompressorLike extends VoiceNodeLike {
  threshold: ParamLike;
  knee: ParamLike;
  ratio: ParamLike;
  attack: ParamLike;
  release: ParamLike;
}

export interface GainNodeLike extends VoiceNodeLike {
  gain: ParamLike;
}

export interface DestinationLike extends VoiceNodeLike {
  stream: MediaStream;
}

export interface VoiceContextLike {
  state?: string;
  currentTime?: number;
  createMediaStreamSource: (stream: MediaStream) => VoiceNodeLike;
  createBiquadFilter: () => BiquadLike;
  createDynamicsCompressor: () => CompressorLike;
  createGain: () => GainNodeLike;
  createMediaStreamDestination: () => DestinationLike;
  resume?: () => Promise<void>;
  close: () => Promise<void>;
  addEventListener?: (type: 'statechange', listener: () => void) => void;
  removeEventListener?: (type: 'statechange', listener: () => void) => void;
}

export interface VoiceLeveler {
  track: MediaStreamTrack;
  processed: boolean;
  sendStream: (base: MediaStream) => MediaStream;
  setInput: (track: MediaStreamTrack) => MediaStreamTrack;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  close: () => void;
}

export interface VoiceLevelerDeps {
  createContext: () => VoiceContextLike | null;
  createStream: (tracks: MediaStreamTrack[]) => MediaStream;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function clampMicVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(MIC_VOLUME_MAX, Math.max(MIC_VOLUME_MIN, value)) : 1;
}

export function micGain(volume: number): number {
  return dbToGain(MAKEUP_GAIN_DB) * clampMicVolume(volume);
}

function browserContext(): VoiceContextLike | null {
  const Context = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Context) {
    return null;
  }
  try {
    return new Context({ latencyHint: 'interactive' }) as unknown as VoiceContextLike;
  } catch {
    return null;
  }
}

let primed: VoiceContextLike | null = null;

export function primeVoiceContext(create: () => VoiceContextLike | null = browserContext): void {
  if (!primed || primed.state === 'closed') {
    primed = create();
  }
  if (primed && primed.state !== 'running') {
    void primed.resume?.().catch(() => undefined);
  }
}

export function takeVoiceContext(create: () => VoiceContextLike | null = browserContext): VoiceContextLike | null {
  const context = primed && primed.state !== 'closed' ? primed : create();
  primed = null;
  return context;
}

const defaultDeps: VoiceLevelerDeps = {
  createContext: () => takeVoiceContext(),
  createStream: (tracks) => new MediaStream(tracks),
};

function setParam(param: ParamLike, value: number): void {
  param.value = value;
}

function configure(node: CompressorLike, settings: typeof COMPRESSOR | typeof LIMITER): void {
  setParam(node.threshold, settings.threshold);
  setParam(node.knee, settings.knee);
  setParam(node.ratio, settings.ratio);
  setParam(node.attack, settings.attack);
  setParam(node.release, settings.release);
}

function disconnect(node: VoiceNodeLike): void {
  try {
    node.disconnect();
  } catch {
    return;
  }
}

function passthrough(input: MediaStreamTrack): VoiceLeveler {
  let current = input;
  return {
    get track() {
      return current;
    },
    processed: false,
    sendStream: (base) => base,
    setInput: (track) => {
      current = track;
      return track;
    },
    setVolume: () => undefined,
    setMuted: () => undefined,
    close: () => undefined,
  };
}

export function createVoiceLeveler(input: MediaStreamTrack, volume: number, deps: Partial<VoiceLevelerDeps> = {}): VoiceLeveler {
  const resolved = { ...defaultDeps, ...deps };
  const context = resolved.createContext();
  if (!context) {
    return passthrough(input);
  }
  if (context.state !== 'running') {
    void context.close().catch(() => undefined);
    return passthrough(input);
  }
  try {
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    setParam(highpass.frequency, HIGHPASS_HZ);
    setParam(highpass.Q, Math.SQRT1_2);
    const compressor = context.createDynamicsCompressor();
    configure(compressor, COMPRESSOR);
    const makeup = context.createGain();
    setParam(makeup.gain, micGain(volume));
    const limiter = context.createDynamicsCompressor();
    configure(limiter, LIMITER);
    const trim = context.createGain();
    setParam(trim.gain, dbToGain(OUTPUT_TRIM_DB));
    const destination = context.createMediaStreamDestination();
    const output = destination.stream.getAudioTracks()[0];
    if (!output) {
      throw new Error('no output');
    }
    highpass.connect(compressor);
    compressor.connect(makeup);
    makeup.connect(limiter);
    limiter.connect(trim);
    trim.connect(destination);
    let source = context.createMediaStreamSource(resolved.createStream([input]));
    source.connect(highpass);
    let closed = false;
    const onState = () => {
      if (!closed && (context.state === 'suspended' || context.state === 'interrupted')) {
        void context.resume?.().catch(() => undefined);
      }
    };
    context.addEventListener?.('statechange', onState);
    return {
      track: output,
      processed: true,
      sendStream: (base) => resolved.createStream([output, ...base.getVideoTracks()]),
      setInput: (track) => {
        if (closed) {
          return output;
        }
        disconnect(source);
        source = context.createMediaStreamSource(resolved.createStream([track]));
        source.connect(highpass);
        return output;
      },
      setVolume: (next) => {
        if (closed) {
          return;
        }
        const target = micGain(next);
        if (makeup.gain.setTargetAtTime && typeof context.currentTime === 'number') {
          makeup.gain.setTargetAtTime(target, context.currentTime, GAIN_SMOOTHING_S);
        } else {
          setParam(makeup.gain, target);
        }
      },
      setMuted: (muted) => {
        output.enabled = !muted;
      },
      close: () => {
        if (closed) {
          return;
        }
        closed = true;
        context.removeEventListener?.('statechange', onState);
        for (const node of [source, highpass, compressor, makeup, limiter, trim, destination]) {
          disconnect(node);
        }
        output.stop();
        void context.close().catch(() => undefined);
      },
    };
  } catch {
    void context.close().catch(() => undefined);
    return passthrough(input);
  }
}
