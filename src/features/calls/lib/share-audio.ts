export interface ShareAudio {
  track: MediaStreamTrack;
  controllable: boolean;
  setVolume: (volume: number) => void;
  stop: () => void;
}

interface GainLike {
  gain: { value: number; setTargetAtTime?: (value: number, start: number, constant: number) => void };
  connect: (node: unknown) => unknown;
  disconnect: () => void;
}

export interface ShareAudioContextLike {
  currentTime?: number;
  state?: string;
  createMediaStreamSource: (stream: MediaStream) => { connect: (node: GainLike) => unknown; disconnect: () => void };
  createGain: () => GainLike;
  createMediaStreamDestination: () => { stream: MediaStream; disconnect?: () => void };
  resume?: () => Promise<void>;
  close: () => Promise<void>;
}

export interface ShareAudioDeps {
  createContext: () => ShareAudioContextLike | null;
  createStream: (tracks: MediaStreamTrack[]) => MediaStream;
}

export function clampVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function defaultCreateContext(): ShareAudioContextLike | null {
  const Context = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Context) {
    return null;
  }
  try {
    return new Context() as unknown as ShareAudioContextLike;
  } catch {
    return null;
  }
}

const defaultDeps: ShareAudioDeps = {
  createContext: defaultCreateContext,
  createStream: (tracks) => new MediaStream(tracks),
};

function passthrough(track: MediaStreamTrack): ShareAudio {
  return { track, controllable: false, setVolume: () => undefined, stop: () => undefined };
}

export function createShareAudio(track: MediaStreamTrack, volume: number, deps: Partial<ShareAudioDeps> = {}): ShareAudio {
  const resolved = { ...defaultDeps, ...deps };
  const context = resolved.createContext();
  if (!context) {
    return passthrough(track);
  }
  try {
    const source = context.createMediaStreamSource(resolved.createStream([track]));
    const gain = context.createGain();
    const destination = context.createMediaStreamDestination();
    const output = destination.stream.getAudioTracks()[0];
    if (!output) {
      throw new Error('no output');
    }
    gain.gain.value = clampVolume(volume);
    source.connect(gain);
    gain.connect(destination);
    if (context.state === 'suspended') {
      void context.resume?.().catch(() => undefined);
    }
    let stopped = false;
    return {
      track: output,
      controllable: true,
      setVolume: (next) => {
        if (!stopped) {
          gain.gain.value = clampVolume(next);
        }
      },
      stop: () => {
        if (stopped) {
          return;
        }
        stopped = true;
        try {
          source.disconnect();
          gain.disconnect();
          output.stop();
        } catch {
          return;
        } finally {
          void context.close().catch(() => undefined);
        }
      },
    };
  } catch {
    void context.close().catch(() => undefined);
    return passthrough(track);
  }
}
