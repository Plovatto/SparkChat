import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPRESSOR,
  HIGHPASS_HZ,
  LIMITER,
  OUTPUT_TRIM_DB,
  clampMicVolume,
  createVoiceLeveler,
  dbToGain,
  micGain,
  primeVoiceContext,
  takeVoiceContext,
  type VoiceContextLike,
  type VoiceNodeLike,
} from './voice-leveler';

interface Param {
  value: number;
  targets: number[];
  setTargetAtTime: (next: number) => void;
}

interface FakeNode extends VoiceNodeLike {
  name: string;
  targets: FakeNode[];
  disconnected: number;
  [key: string]: unknown;
}

function param(value = 0): Param {
  const created: Param = { value, targets: [], setTargetAtTime: (next) => void created.targets.push(next) };
  return created;
}

function fakeContext(state = 'running') {
  const output = { kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; } };
  const nodes: FakeNode[] = [];
  const sources: Array<{ node: FakeNode; stream: MediaStream }> = [];
  let compressors = 0;
  const node = (name: string, extra: Record<string, unknown> = {}): FakeNode => {
    const created: FakeNode = {
      name,
      targets: [],
      disconnected: 0,
      connect(target) {
        created.targets.push(target as FakeNode);
        return target;
      },
      disconnect() {
        created.disconnected += 1;
      },
      ...extra,
    };
    nodes.push(created);
    return created;
  };
  const calls = { closed: 0, resumed: 0 };
  const raw: Record<string, unknown> = {
    state,
    currentTime: 3,
    createMediaStreamSource: (stream: MediaStream) => {
      const created = node(`source${sources.length}`);
      sources.push({ node: created, stream });
      return created;
    },
    createBiquadFilter: () => node('highpass', { type: 'lowpass', frequency: param(), Q: param() }),
    createDynamicsCompressor: () => {
      compressors += 1;
      return node(compressors === 1 ? 'compressor' : 'limiter', { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
    },
    createGain: () => node(nodes.some((candidate) => candidate.name === 'makeup') ? 'trim' : 'makeup', { gain: param(1) }),
    createMediaStreamDestination: () => node('destination', { stream: { getAudioTracks: () => [output] } }),
    resume: () => {
      calls.resumed += 1;
      return Promise.resolve();
    },
    close: () => {
      calls.closed += 1;
      return Promise.resolve();
    },
  };
  const find = (name: string): FakeNode => {
    const found = nodes.find((candidate) => candidate.name === name);
    if (!found) {
      throw new Error(`missing ${name}`);
    }
    return found;
  };
  const paramOf = (name: string, key: string): Param => find(name)[key] as Param;
  return { context: raw as unknown as VoiceContextLike, raw, output, nodes, sources, calls, find, paramOf };
}

const mic = { kind: 'audio', id: 'mic' } as unknown as MediaStreamTrack;
const createStream = (tracks: MediaStreamTrack[]) => ({ tracks, getAudioTracks: () => tracks, getVideoTracks: () => [] }) as unknown as MediaStream;
const tracksOf = (stream: MediaStream | undefined) => (stream as unknown as { tracks: unknown[] } | undefined)?.tracks;

afterEach(() => {
  takeVoiceContext(() => null);
});

describe('gain mapping', () => {
  it('converts decibels to linear gain', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(6)).toBeCloseTo(1.995, 3);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
  });

  it('keeps the microphone volume between 50% and 200% and defaults to 100%', () => {
    expect(clampMicVolume(0.1)).toBe(0.5);
    expect(clampMicVolume(3)).toBe(2);
    expect(clampMicVolume(1.25)).toBe(1.25);
    expect(clampMicVolume(Number.NaN)).toBe(1);
    expect(clampMicVolume('loud')).toBe(1);
  });

  it('maps 100% to the calibrated +6 dB makeup gain', () => {
    expect(micGain(1)).toBeCloseTo(dbToGain(6), 6);
    expect(micGain(0.5)).toBeCloseTo(dbToGain(6) / 2, 6);
    expect(micGain(2)).toBeCloseTo(dbToGain(6) * 2, 6);
    expect(micGain(0.5)).toBeCloseTo(1, 2);
    expect(micGain(9)).toBe(micGain(2));
  });
});

describe('createVoiceLeveler', () => {
  it('wires source, high-pass, compressor, makeup gain, limiter and destination in order', () => {
    const fake = fakeContext();
    const leveler = createVoiceLeveler(mic, 1, { createContext: () => fake.context, createStream });

    expect(leveler.processed).toBe(true);
    expect(leveler.track).toBe(fake.output);
    const chain = ['source0', 'highpass', 'compressor', 'makeup', 'limiter', 'trim', 'destination'];
    chain.slice(0, -1).forEach((name, index) => {
      expect(fake.find(name).targets.map((target) => target.name)).toEqual([chain[index + 1]]);
    });
    expect(tracksOf(fake.sources[0]?.stream)).toEqual([mic]);
  });

  it('configures the filter, compressor, gain and limiter with the calibrated values', () => {
    const fake = fakeContext();
    createVoiceLeveler(mic, 1, { createContext: () => fake.context, createStream });

    expect(fake.find('highpass').type).toBe('highpass');
    expect(fake.paramOf('highpass', 'frequency').value).toBe(HIGHPASS_HZ);
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release'] as const) {
      expect(fake.paramOf('compressor', key).value).toBe(COMPRESSOR[key]);
      expect(fake.paramOf('limiter', key).value).toBe(LIMITER[key]);
    }
    expect(fake.paramOf('makeup', 'gain').value).toBeCloseTo(dbToGain(6), 6);
    expect(fake.paramOf('trim', 'gain').value).toBeCloseTo(dbToGain(OUTPUT_TRIM_DB), 6);
  });

  it('applies volume changes smoothly to the makeup gain', () => {
    const fake = fakeContext();
    const leveler = createVoiceLeveler(mic, 1, { createContext: () => fake.context, createStream });

    leveler.setVolume(2);

    expect(fake.paramOf('makeup', 'gain').targets).toEqual([micGain(2)]);
  });

  it('mutes by disabling the output track without stopping it', () => {
    const fake = fakeContext();
    const leveler = createVoiceLeveler(mic, 1, { createContext: () => fake.context, createStream });

    leveler.setMuted(true);
    expect(fake.output.enabled).toBe(false);
    expect(fake.output.stopped).toBe(false);
    leveler.setMuted(false);
    expect(fake.output.enabled).toBe(true);
  });

  it('rebuilds only the source when the microphone changes', () => {
    const fake = fakeContext();
    const leveler = createVoiceLeveler(mic, 1, { createContext: () => fake.context, createStream });
    const next = { kind: 'audio', id: 'next' } as unknown as MediaStreamTrack;

    expect(leveler.setInput(next)).toBe(fake.output);

    expect(fake.find('source0').disconnected).toBe(1);
    expect(fake.find('source1').targets.map((target) => target.name)).toEqual(['highpass']);
    expect(tracksOf(fake.sources[1]?.stream)).toEqual([next]);
    expect(fake.find('highpass').disconnected).toBe(0);
  });

  it('builds the send stream from the leveled track plus the camera', () => {
    const fake = fakeContext();
    const leveler = createVoiceLeveler(mic, 1, { createContext: () => fake.context, createStream });
    const camera = { kind: 'video' };
    const base = { getVideoTracks: () => [camera] } as unknown as MediaStream;

    expect(tracksOf(leveler.sendStream(base))).toEqual([fake.output, camera]);
  });

  it('closes the graph, the output and the context once', () => {
    const fake = fakeContext();
    const leveler = createVoiceLeveler(mic, 1, { createContext: () => fake.context, createStream });

    leveler.close();
    leveler.close();
    leveler.setVolume(2);

    expect(fake.calls.closed).toBe(1);
    expect(fake.output.stopped).toBe(true);
    expect(fake.nodes.every((node) => node.disconnected === 1)).toBe(true);
    expect(fake.paramOf('makeup', 'gain').targets).toEqual([]);
  });

  it('falls back to the raw track without WebAudio', () => {
    const leveler = createVoiceLeveler(mic, 1, { createContext: () => null, createStream });

    expect(leveler.processed).toBe(false);
    expect(leveler.track).toBe(mic);
    const base = createStream([mic]);
    expect(leveler.sendStream(base)).toBe(base);
  });

  it('falls back to the raw track when the context is not running', () => {
    const fake = fakeContext('suspended');
    const leveler = createVoiceLeveler(mic, 1, { createContext: () => fake.context, createStream });

    expect(leveler.processed).toBe(false);
    expect(leveler.track).toBe(mic);
    expect(fake.calls.closed).toBe(1);
  });

  it('falls back when the graph cannot be built', () => {
    const fake = fakeContext();
    fake.raw.createDynamicsCompressor = () => {
      throw new Error('unsupported');
    };
    const leveler = createVoiceLeveler(mic, 1, { createContext: () => fake.context, createStream });

    expect(leveler.processed).toBe(false);
    expect(fake.calls.closed).toBe(1);
  });
});

describe('primeVoiceContext', () => {
  it('creates and resumes a context from the user gesture and hands it over once', () => {
    const fake = fakeContext('suspended');
    let created = 0;
    const create = () => {
      created += 1;
      return fake.context;
    };

    primeVoiceContext(create);
    primeVoiceContext(create);

    expect(created).toBe(1);
    expect(fake.calls.resumed).toBe(2);
    expect(takeVoiceContext(() => null)).toBe(fake.context);
    expect(takeVoiceContext(() => null)).toBeNull();
  });
});
