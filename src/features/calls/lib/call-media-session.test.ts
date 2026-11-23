import { describe, expect, it, vi } from 'vitest';
import { startCallMediaSession, type CallMediaSessionOptions, type MediaSessionLike } from './call-media-session';

function fakeSession(unsupported: string[] = []) {
  const handlers = new Map<string, (() => void) | null>();
  const session: MediaSessionLike & { microphone: boolean[] } = {
    metadata: null,
    playbackState: 'none',
    microphone: [],
    setActionHandler: (action, handler) => {
      if (unsupported.includes(action)) {
        throw new TypeError('unsupported');
      }
      handlers.set(action, handler);
    },
    setMicrophoneActive: (active) => {
      session.microphone.push(active);
    },
  };
  return { session, handlers };
}

function options(patch: Partial<CallMediaSessionOptions> = {}): CallMediaSessionOptions {
  return { title: 'Ada', artist: 'Voice call', muted: false, onHangup: vi.fn(), onToggleMicrophone: vi.fn(), ...patch };
}

const metadata = (init: { title: string; artist: string }) => ({ ...init });

describe('startCallMediaSession', () => {
  it('registers the peer name, the playing state and the hangup and microphone handlers', () => {
    const { session, handlers } = fakeSession();
    const opts = options();
    startCallMediaSession(opts, session, metadata);

    expect(session.metadata).toEqual({ title: 'Ada', artist: 'Voice call' });
    expect(session.playbackState).toBe('playing');
    expect(session.microphone).toEqual([true]);

    handlers.get('hangup')?.();
    handlers.get('togglemicrophone')?.();
    expect(opts.onHangup).toHaveBeenCalledTimes(1);
    expect(opts.onToggleMicrophone).toHaveBeenCalledTimes(1);
  });

  it('updates metadata and the microphone state, and routes handlers to the newest callbacks', () => {
    const { session, handlers } = fakeSession();
    const call = startCallMediaSession(options(), session, metadata);
    const next = options({ title: 'Grace', muted: true });

    call.update(next);
    handlers.get('hangup')?.();

    expect(session.metadata).toEqual({ title: 'Grace', artist: 'Voice call' });
    expect(session.microphone).toEqual([true, false]);
    expect(next.onHangup).toHaveBeenCalledTimes(1);
  });

  it('keeps the call playing when the system or the notification asks to pause or play', () => {
    const { session, handlers } = fakeSession();
    const onResume = vi.fn();
    startCallMediaSession(options({ onResume }), session, metadata);

    session.playbackState = 'paused';
    handlers.get('pause')?.();
    expect(session.playbackState).toBe('playing');
    handlers.get('play')?.();

    expect(onResume).toHaveBeenCalledTimes(2);
  });

  it('leaves the system play and pause behaviour alone when nothing needs to be kept playing', () => {
    const { session, handlers } = fakeSession();
    startCallMediaSession(options(), session, metadata);
    expect(handlers.has('play')).toBe(false);
    expect(handlers.has('pause')).toBe(false);
  });

  it('clears everything on stop and ignores later updates', () => {
    const { session, handlers } = fakeSession();
    const call = startCallMediaSession(options({ onResume: vi.fn() }), session, metadata);

    call.stop();
    call.update(options({ title: 'Late' }));

    expect(handlers.get('hangup')).toBeNull();
    expect(handlers.get('togglemicrophone')).toBeNull();
    expect(handlers.get('play')).toBeNull();
    expect(handlers.get('pause')).toBeNull();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
  });

  it('copes with browsers that reject an action or lack the media session', () => {
    const { session, handlers } = fakeSession(['togglemicrophone', 'play', 'pause']);
    const call = startCallMediaSession(options({ onResume: vi.fn() }), session, metadata);
    expect([...handlers.keys()]).toEqual(['hangup']);
    expect(session.playbackState).toBe('playing');
    call.stop();

    const missing = startCallMediaSession(options(), null, metadata);
    expect(() => {
      missing.update(options());
      missing.stop();
    }).not.toThrow();
  });
});
