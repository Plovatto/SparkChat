import { describe, expect, it } from 'vitest';
import { DUCK_LEVEL, Ducker } from './ducking';
import { createShareAudio, type ShareAudio, type ShareAudioContextLike } from './share-audio';
import { isChromium, shareAudioTrack, shareMonitorSupport, startShareMonitor, type MonitorElement } from './share-monitor';

function track(kind: 'audio' | 'video', settings: Record<string, unknown> = {}, readyState = 'live'): MediaStreamTrack {
  return { kind, readyState, getSettings: () => settings } as unknown as MediaStreamTrack;
}

function stream(audio: MediaStreamTrack[], video: MediaStreamTrack[] = [track('video', { displaySurface: 'browser' })]): MediaStream {
  return { getAudioTracks: () => audio, getVideoTracks: () => video } as unknown as MediaStream;
}

function element(): MonitorElement & { paused: number } {
  return {
    srcObject: null,
    volume: 0.5,
    paused: 0,
    pause() {
      this.paused += 1;
    },
  };
}

function fakeContext() {
  const output = {
    kind: 'audio',
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
  const state = { closed: 0, disconnected: 0, connected: [] as string[] };
  const gain = { gain: { value: 1 }, connect: () => void state.connected.push('gain->destination'), disconnect: () => void (state.disconnected += 1) };
  const context: ShareAudioContextLike = {
    createMediaStreamSource: () => ({ connect: () => void state.connected.push('source->gain'), disconnect: () => void (state.disconnected += 1) }),
    createGain: () => gain,
    createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [output] } as unknown as MediaStream }),
    close: () => {
      state.closed += 1;
      return Promise.resolve();
    },
  };
  return { context, gain, output, state };
}

function manualTimers() {
  let next = 1;
  const intervals = new Map<number, () => void>();
  const timeouts = new Map<number, () => void>();
  return {
    timers: {
      setInterval: (handler: () => void) => {
        const id = next++;
        intervals.set(id, handler);
        return id as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: (id: ReturnType<typeof setInterval>) => void intervals.delete(id as unknown as number),
      setTimeout: (handler: () => void) => {
        const id = next++;
        timeouts.set(id, handler);
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (id: ReturnType<typeof setTimeout>) => void timeouts.delete(id as unknown as number),
    },
    flush() {
      for (let guard = 0; guard < 500 && (intervals.size > 0 || timeouts.size > 0); guard += 1) {
        for (const [id, handler] of Array.from(intervals)) {
          if (intervals.has(id)) {
            handler();
          }
        }
        if (intervals.size === 0) {
          for (const [id, handler] of Array.from(timeouts)) {
            timeouts.delete(id);
            handler();
          }
        }
      }
    },
  };
}

const raw = track('audio');
const createStream = (tracks: MediaStreamTrack[]) => ({ tracks }) as unknown as MediaStream;

function monitorDeps(audio: ReturnType<typeof fakeContext>, played: MonitorElement[] = []) {
  return {
    createShareAudio: (input: MediaStreamTrack, volume: number) => createShareAudio(input, volume, { createContext: () => audio.context, createStream: () => ({}) as MediaStream }),
    createStream,
    play: (target: MonitorElement) => void played.push(target),
  };
}

describe('isChromium', () => {
  it('detects Chrome and Edge from client hints or the user agent', () => {
    expect(isChromium({ userAgentData: { brands: [{ brand: 'Not A Brand' }, { brand: 'Chromium' }] } })).toBe(true);
    expect(isChromium({ userAgentData: { brands: [{ brand: 'Microsoft Edge' }] } })).toBe(true);
    expect(isChromium({ userAgent: 'Mozilla/5.0 Chrome/131.0 Safari/537.36' })).toBe(true);
    expect(isChromium({ userAgent: 'Mozilla/5.0 Firefox/133.0' })).toBe(false);
    expect(isChromium({ userAgent: 'Mozilla/5.0 Version/18.0 Safari/605.1.15' })).toBe(false);
    expect(isChromium(undefined)).toBe(false);
  });
});

describe('shareMonitorSupport', () => {
  it('is none when the share has no live audio', () => {
    expect(shareMonitorSupport(null, true)).toBe('none');
    expect(shareMonitorSupport(stream([]), true)).toBe('none');
    expect(shareMonitorSupport(stream([track('audio', {}, 'ended')]), true)).toBe('none');
  });

  it('trusts the suppressLocalAudioPlayback setting for a tab or an unknown surface', () => {
    expect(shareMonitorSupport(stream([track('audio', { suppressLocalAudioPlayback: true })]), false)).toBe('local');
    expect(shareMonitorSupport(stream([track('audio', { suppressLocalAudioPlayback: true })], [track('video')]), false)).toBe('local');
    expect(shareMonitorSupport(stream([track('audio', { suppressLocalAudioPlayback: false })]), true)).toBe('unsupported');
  });

  it('never monitors a window or screen share because the source keeps playing locally', () => {
    expect(shareMonitorSupport(stream([track('audio', { suppressLocalAudioPlayback: true })], [track('video', { displaySurface: 'window' })]), true)).toBe('unsupported');
    expect(shareMonitorSupport(stream([track('audio', { suppressLocalAudioPlayback: true })], [track('video', { displaySurface: 'monitor' })]), true)).toBe('unsupported');
  });

  it('only assumes suppression for a Chromium tab capture when the setting is missing', () => {
    expect(shareMonitorSupport(stream([track('audio')]), true)).toBe('local');
    expect(shareMonitorSupport(stream([track('audio')]), false)).toBe('unsupported');
    expect(shareMonitorSupport(stream([track('audio')], [track('video', { displaySurface: 'window' })]), true)).toBe('unsupported');
    expect(shareMonitorSupport(stream([track('audio')], [track('video', { displaySurface: 'monitor' })]), true)).toBe('unsupported');
  });

  it('picks the live audio track', () => {
    const live = track('audio');
    expect(shareAudioTrack(stream([track('audio', {}, 'ended'), live]))).toBe(live);
  });
});

describe('startShareMonitor', () => {
  it('plays the raw share audio through its own gain node into the monitor element', () => {
    const audio = fakeContext();
    const target = element();
    const played: MonitorElement[] = [];
    const monitor = startShareMonitor(target, raw, 0.4, monitorDeps(audio, played));

    expect(audio.state.connected).toEqual(['source->gain', 'gain->destination']);
    expect((target.srcObject as unknown as { tracks: unknown[] }).tracks).toEqual([audio.output]);
    expect(target.volume).toBe(1);
    expect(audio.gain.gain.value).toBe(0.4);
    expect(played).toEqual([target]);

    monitor.setVolume(0.2);
    expect(audio.gain.gain.value).toBe(0.2);
  });

  it('cleans up the element, nodes and context once on stop', () => {
    const audio = fakeContext();
    const target = element();
    const monitor = startShareMonitor(target, raw, 1, monitorDeps(audio));

    monitor.stop();
    monitor.stop();
    monitor.setVolume(0.1);

    expect(target.srcObject).toBeNull();
    expect(target.paused).toBe(1);
    expect(audio.output.stopped).toBe(true);
    expect(audio.state.closed).toBe(1);
    expect(audio.state.disconnected).toBe(2);
    expect(audio.gain.gain.value).toBe(1);
  });

  it('keeps the monitor separate from the gain that feeds the peer', () => {
    const peer = fakeContext();
    const local = fakeContext();
    const peerAudio = createShareAudio(raw, 0.9, { createContext: () => peer.context, createStream: () => ({}) as MediaStream });
    const monitor = startShareMonitor(element(), raw, 0.5, monitorDeps(local));

    monitor.setVolume(0.1);
    expect(peer.gain.gain.value).toBe(0.9);
    expect(local.gain.gain.value).toBe(0.1);
    monitor.stop();
    expect(peer.state.closed).toBe(0);
    expect(peer.output.stopped).toBe(false);
    expect(peerAudio.track).toBe(peer.output);
  });

  it('falls back to the element volume when no audio context is available', () => {
    const target = element();
    const passthrough: ShareAudio = { track: raw, controllable: false, setVolume: () => undefined, stop: () => undefined };
    const monitor = startShareMonitor(target, raw, 0.3, { createShareAudio: () => passthrough, createStream, play: () => undefined });

    expect(target.volume).toBe(0.3);
    monitor.setVolume(0.7);
    expect(target.volume).toBe(0.7);
    monitor.stop();
    expect(target.srcObject).toBeNull();
  });

  it('follows the ducking curve while someone speaks and recovers afterwards', () => {
    const audio = fakeContext();
    const monitor = startShareMonitor(element(), raw, 0.8, monitorDeps(audio));
    const clock = manualTimers();
    const levels: number[] = [];
    const ducker = new Ducker((level) => {
      levels.push(level);
      monitor.setVolume(0.8 * level);
    }, clock.timers);

    ducker.update(true, true);
    clock.flush();
    expect(audio.gain.gain.value).toBeCloseTo(0.8 * DUCK_LEVEL, 5);
    expect(levels.length).toBeGreaterThan(1);

    ducker.update(true, false);
    clock.flush();
    expect(audio.gain.gain.value).toBeCloseTo(0.8, 5);
    ducker.dispose();
  });
});
