import { describe, expect, it } from 'vitest';
import { clampVolume, createShareAudio, type ShareAudioContextLike } from './share-audio';

function fakeAudio() {
  const output = { kind: 'audio', stopped: false, stop() { this.stopped = true; } };
  const calls = { closed: 0, disconnected: 0, connected: [] as string[] };
  const gain = {
    gain: { value: 1 },
    connect: () => void calls.connected.push('gain->destination'),
    disconnect: () => void (calls.disconnected += 1),
  };
  const context: ShareAudioContextLike = {
    createMediaStreamSource: () => ({ connect: () => void calls.connected.push('source->gain'), disconnect: () => void (calls.disconnected += 1) }),
    createGain: () => gain,
    createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [output] } as unknown as MediaStream }),
    close: () => {
      calls.closed += 1;
      return Promise.resolve();
    },
  };
  return { context, gain, output, calls };
}

const raw = { kind: 'audio' } as unknown as MediaStreamTrack;
const createStream = () => ({}) as MediaStream;

describe('clampVolume', () => {
  it('keeps the volume between 0 and 1 and defaults to 1', () => {
    expect(clampVolume(0.3)).toBe(0.3);
    expect(clampVolume(-2)).toBe(0);
    expect(clampVolume(5)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(1);
    expect(clampVolume('x')).toBe(1);
  });
});

describe('createShareAudio', () => {
  it('sends the gain node output instead of the raw track and applies the volume', () => {
    const audio = fakeAudio();
    const share = createShareAudio(raw, 0.6, { createContext: () => audio.context, createStream });

    expect(share.track).toBe(audio.output);
    expect(share.controllable).toBe(true);
    expect(audio.gain.gain.value).toBe(0.6);
    expect(audio.calls.connected).toEqual(['source->gain', 'gain->destination']);

    share.setVolume(0);
    expect(audio.gain.gain.value).toBe(0);
    share.setVolume(2);
    expect(audio.gain.gain.value).toBe(1);
  });

  it('cleans up the nodes and the context once', () => {
    const audio = fakeAudio();
    const share = createShareAudio(raw, 1, { createContext: () => audio.context, createStream });

    share.stop();
    share.stop();
    share.setVolume(0.1);

    expect(audio.calls.disconnected).toBe(2);
    expect(audio.calls.closed).toBe(1);
    expect(audio.output.stopped).toBe(true);
    expect(audio.gain.gain.value).toBe(1);
  });

  it('falls back to the raw track without a volume control when WebAudio is missing or fails', () => {
    const missing = createShareAudio(raw, 0.5, { createContext: () => null, createStream });
    expect(missing.track).toBe(raw);
    expect(missing.controllable).toBe(false);

    const audio = fakeAudio();
    audio.context.createGain = () => {
      throw new Error('boom');
    };
    const failed = createShareAudio(raw, 0.5, { createContext: () => audio.context, createStream });
    expect(failed.track).toBe(raw);
    expect(audio.calls.closed).toBe(1);
  });
});
