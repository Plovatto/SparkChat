import { describe, expect, it, vi } from 'vitest';
import { trackedContextCount } from './audio-keepalive';
import { PLAYBACK_LIMITER, clampCallVolume, createPlaybackBoost, playbackPlan, type PlaybackContextLike } from './voice-playback';

function fakeContext(state = 'running') {
  const destination = { stream: { id: 'boosted' } as unknown as MediaStream };
  const calls = { closed: 0, connected: [] as string[], disconnected: 0, targets: [] as number[] };
  const gain = {
    gain: { value: 1, setTargetAtTime: (value: number) => void calls.targets.push(value) },
    connect: () => void calls.connected.push('gain->destination'),
    disconnect: () => void (calls.disconnected += 1),
  };
  const context: PlaybackContextLike = {
    state,
    currentTime: 1,
    createMediaStreamSource: () => ({ connect: () => void calls.connected.push('source->gain'), disconnect: () => void (calls.disconnected += 1) }),
    createGain: () => gain,
    createMediaStreamDestination: () => destination,
    close: () => {
      calls.closed += 1;
      return Promise.resolve();
    },
  };
  return { context, gain, destination, calls };
}

function keepAlive() {
  const element = {
    srcObject: null as MediaProvider | null,
    muted: false,
    playing: false,
    play: () => {
      element.playing = true;
      return Promise.resolve();
    },
    pause: () => {
      element.playing = false;
    },
  };
  return element;
}

const remote = { id: 'remote' } as unknown as MediaStream;

describe('call volume mapping', () => {
  it('keeps the call volume between 0% and 200% and defaults to 100%', () => {
    expect(clampCallVolume(-1)).toBe(0);
    expect(clampCallVolume(5)).toBe(2);
    expect(clampCallVolume(Number.NaN)).toBe(1);
  });

  it('plays directly up to 100% and boosts above it', () => {
    expect(playbackPlan(0.4)).toEqual({ boosted: false, elementVolume: 0.4, gain: 1 });
    expect(playbackPlan(1)).toEqual({ boosted: false, elementVolume: 1, gain: 1 });
    expect(playbackPlan(1.5)).toEqual({ boosted: true, elementVolume: 1, gain: 1.5 });
    expect(playbackPlan(9)).toEqual({ boosted: true, elementVolume: 1, gain: 2 });
  });
});

describe('createPlaybackBoost', () => {
  it('keeps the boost context running in the background and stops tracking it on stop', () => {
    const fake = fakeContext();
    const resume = vi.fn(() => Promise.resolve());
    const listeners: Array<() => void> = [];
    fake.context.resume = resume;
    fake.context.addEventListener = (_type, listener) => void listeners.push(listener);
    const before = trackedContextCount();
    const boost = createPlaybackBoost(remote, 1.6, { createContext: () => fake.context, createKeepAlive: () => keepAlive() });

    expect(trackedContextCount()).toBe(before + 1);
    fake.context.state = 'suspended';
    listeners.forEach((listener) => listener());
    expect(resume).toHaveBeenCalledTimes(1);

    boost?.stop();
    expect(trackedContextCount()).toBe(before);
  });

  it('routes the remote voice through a gain into a playable stream', () => {
    const fake = fakeContext();
    const element = keepAlive();
    const boost = createPlaybackBoost(remote, 1.6, { createContext: () => fake.context, createKeepAlive: () => element });

    expect(boost?.stream).toBe(fake.destination.stream);
    expect(fake.gain.gain.value).toBe(1.6);
    expect(fake.calls.connected).toEqual(['source->gain', 'gain->destination']);
    expect(element).toMatchObject({ srcObject: remote, muted: true, playing: true });
  });

  it('changes the gain live and releases everything on stop', () => {
    const fake = fakeContext();
    const element = keepAlive();
    const boost = createPlaybackBoost(remote, 1.2, { createContext: () => fake.context, createKeepAlive: () => element });

    boost?.setGain(1.8);
    boost?.stop();
    boost?.stop();
    boost?.setGain(2);

    expect(fake.calls.targets).toEqual([1.8]);
    expect(fake.calls.closed).toBe(1);
    expect(fake.calls.disconnected).toBe(2);
    expect(element).toMatchObject({ srcObject: null, playing: false });
  });

  it('declines to boost without WebAudio or a running context', () => {
    expect(createPlaybackBoost(remote, 1.5, { createContext: () => null })).toBeNull();
    const fake = fakeContext('suspended');
    expect(createPlaybackBoost(remote, 1.5, { createContext: () => fake.context, createKeepAlive: () => null })).toBeNull();
    expect(fake.calls.closed).toBe(1);
  });
});

describe('playback limiter', () => {
  it('limits the boosted signal before it reaches the speaker', () => {
    const fake = fakeContext();
    const order: string[] = [];
    const param = () => ({ value: 0 });
    const limiter = { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: () => void order.push('limiter->destination'), disconnect: () => undefined };
    fake.gain.connect = (node?: unknown) => void order.push(node === limiter ? 'gain->limiter' : 'gain->other');
    const context = { ...fake.context, createDynamicsCompressor: () => limiter };

    createPlaybackBoost(remote, 2, { createContext: () => context, createKeepAlive: () => null });

    expect(order).toEqual(['gain->limiter', 'limiter->destination']);
    expect(limiter.threshold.value).toBe(PLAYBACK_LIMITER.threshold);
    expect(limiter.ratio.value).toBe(PLAYBACK_LIMITER.ratio);
  });
});
