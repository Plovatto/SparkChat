import { describe, expect, it } from 'vitest';
import { LEVEL_INTERVAL_MS, QUIET, SPEAKING_HOLD_MS, monitorSpeaking, nextSpeaking, rmsLevel, sharedMeterContext, type AudioContextLike } from './audio-level';

function samples(amplitude: number, length = 64): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => 128 + (index % 2 === 0 ? amplitude : -amplitude));
}

describe('rmsLevel', () => {
  it('is zero for silence and grows with the amplitude', () => {
    expect(rmsLevel(samples(0))).toBe(0);
    expect(rmsLevel([])).toBe(0);
    expect(rmsLevel(samples(64))).toBeCloseTo(0.5, 2);
    expect(rmsLevel(samples(127))).toBeLessThanOrEqual(1);
  });
});

describe('nextSpeaking', () => {
  it('starts speaking above the threshold and holds briefly through short pauses', () => {
    let state = nextSpeaking(QUIET, 0.2, 0);
    expect(state.speaking).toBe(true);
    state = nextSpeaking(state, 0.03, 100);
    expect(state.speaking).toBe(true);
    state = nextSpeaking(state, 0, 200);
    expect(state.speaking).toBe(true);
    state = nextSpeaking(state, 0, 100 + SPEAKING_HOLD_MS);
    expect(state.speaking).toBe(false);
  });

  it('ignores background noise below the threshold', () => {
    expect(nextSpeaking(QUIET, 0.03, 0).speaking).toBe(false);
  });
});

function fakeContext(levels: number[]) {
  const calls = { closed: 0, disconnected: 0, resumed: 0 };
  const context: AudioContextLike = {
    state: 'suspended',
    createMediaStreamSource: () => ({ connect: () => undefined, disconnect: () => void (calls.disconnected += 1) }),
    createAnalyser: () => ({
      fftSize: 0,
      getByteTimeDomainData: (array: Uint8Array) => array.set(samples(Math.round((levels.shift() ?? 0) * 128), array.length)),
      disconnect: () => void (calls.disconnected += 1),
    }),
    resume: () => {
      calls.resumed += 1;
      return Promise.resolve();
    },
    close: () => {
      calls.closed += 1;
      return Promise.resolve();
    },
  };
  return { context, calls };
}

function stream(audio: boolean): MediaStream {
  return { getAudioTracks: () => (audio ? [{}] : []) } as unknown as MediaStream;
}

describe('monitorSpeaking', () => {
  it('samples at about 10 Hz, reports changes only and cleans everything up', () => {
    const { context, calls } = fakeContext([0.3, 0.3, 0, 0, 0, 0, 0, 0]);
    let tick: () => void = () => undefined;
    let interval = 0;
    let cleared = 0;
    let now = 0;
    const changes: boolean[] = [];
    const stop = monitorSpeaking(stream(true), (speaking) => changes.push(speaking), {
      createContext: () => context,
      now: () => now,
      setInterval: (handler, ms) => {
        tick = handler;
        interval = ms;
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: () => void (cleared += 1),
    });

    expect(interval).toBe(LEVEL_INTERVAL_MS);
    expect(calls.resumed).toBe(1);
    for (let index = 0; index < 8; index += 1) {
      tick();
      now += LEVEL_INTERVAL_MS;
    }
    expect(changes).toEqual([true, false]);

    stop();
    stop();
    expect(cleared).toBe(1);
    expect(calls.disconnected).toBe(2);
    expect(calls.closed).toBe(1);
  });

  it('does nothing without audio tracks or audio context support', () => {
    let created = 0;
    monitorSpeaking(stream(false), () => undefined, { createContext: () => { created += 1; return null; } });
    expect(created).toBe(0);
    expect(() => monitorSpeaking(stream(true), () => undefined, { createContext: () => null })()).not.toThrow();
  });
});

describe('sharedMeterContext', () => {
  function fakeContext() {
    return { state: 'running', closed: 0, createMediaStreamSource: () => ({ connect: () => undefined, disconnect: () => undefined }), createAnalyser: () => ({ fftSize: 0, getByteTimeDomainData: () => undefined, disconnect: () => undefined }), close() { this.closed += 1; this.state = 'closed'; return Promise.resolve(); } };
  }

  it('lets every level meter share one audio context and closes it after the last one leaves', async () => {
    const created: Array<ReturnType<typeof fakeContext>> = [];
    const create = () => {
      const context = fakeContext();
      created.push(context);
      return context;
    };
    const first = sharedMeterContext(create);
    const second = sharedMeterContext(create);
    expect(created).toHaveLength(1);
    await first?.close();
    await first?.close();
    expect(created[0]!.closed).toBe(0);
    await second?.close();
    expect(created[0]!.closed).toBe(1);
    const third = sharedMeterContext(create);
    expect(created).toHaveLength(2);
    await third?.close();
  });

  it('returns nothing without audio context support', () => {
    expect(sharedMeterContext(() => null)).toBeNull();
  });
});
