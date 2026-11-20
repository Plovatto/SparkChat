import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CallContext, type CallApi } from '../call-context';
import { EMPTY_CALL_SNAPSHOT, type CallSnapshot } from '../lib/call-controller';
import { CallAudio } from './CallAudio';

class FakeStream {
  constructor(private readonly tracks: Array<{ id: string; kind: string }>) {}
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }
  getTracks() {
    return this.tracks;
  }
}

function stream(kind = 'audio'): MediaStream {
  return new FakeStream([{ id: `${kind}-1`, kind }]) as unknown as MediaStream;
}

function snapshot(patch: Partial<CallSnapshot>): CallSnapshot {
  return { ...EMPTY_CALL_SNAPSHOT, ...patch, state: patch.state ?? EMPTY_CALL_SNAPSHOT.state };
}

function api(call: CallSnapshot, minimized: boolean): CallApi {
  return { snapshot: call, minimized } as unknown as CallApi;
}

const live = { ...EMPTY_CALL_SNAPSHOT.state, phase: 'active' as const };

describe('CallAudio', () => {
  let play: MockInstance<() => Promise<void>>;
  let pause: MockInstance<() => void>;

  beforeEach(() => {
    vi.stubGlobal('MediaStream', FakeStream);
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, writable: true, value: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    play.mockRestore();
    pause.mockRestore();
  });

  function mount(call: CallSnapshot, minimized: boolean) {
    const voiceRef = createRef<HTMLAudioElement>();
    const shareRef = createRef<HTMLAudioElement>();
    const monitorRef = createRef<HTMLAudioElement>();
    const view = render(
      <CallContext value={api(call, minimized)}>
        <CallAudio voiceRef={voiceRef} shareRef={shareRef} monitorRef={monitorRef} />
      </CallContext>,
    );
    const rerender = (next: CallSnapshot, nextMinimized: boolean) =>
      view.rerender(
        <CallContext value={api(next, nextMinimized)}>
          <CallAudio voiceRef={voiceRef} shareRef={shareRef} monitorRef={monitorRef} />
        </CallContext>,
      );
    return { voiceRef, shareRef, rerender, view };
  }

  it('plays the peer voice and the shared audio and keeps them mounted when the call is minimized', () => {
    const remote = stream();
    const screen = stream();
    const call = snapshot({ state: live, remoteStream: remote, remoteScreenOn: true, remoteScreenStream: screen });
    const { voiceRef, shareRef, rerender } = mount(call, false);

    expect(voiceRef.current?.srcObject).not.toBeNull();
    expect(shareRef.current?.srcObject).toBe(screen);

    const voice = voiceRef.current;
    const share = shareRef.current;
    rerender(call, true);

    expect(voiceRef.current).toBe(voice);
    expect(shareRef.current).toBe(share);
    expect(voiceRef.current?.srcObject).not.toBeNull();
    expect(shareRef.current?.srcObject).toBe(screen);
    expect(pause).not.toHaveBeenCalled();
  });

  it('does not pause anything when the page is hidden and plays again when it returns', () => {
    const call = snapshot({ state: live, remoteStream: stream() });
    mount(call, false);
    play.mockClear();

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(play).toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it('releases the shared audio element when the share ends but keeps the voice', () => {
    const screen = stream();
    const remote = stream();
    const call = snapshot({ state: live, remoteStream: remote, remoteScreenOn: true, remoteScreenStream: screen });
    const { voiceRef, shareRef, rerender } = mount(call, false);

    rerender(snapshot({ state: live, remoteStream: remote, remoteScreenOn: false, remoteScreenStream: null }), false);

    expect(shareRef.current?.srcObject).toBeNull();
    expect(voiceRef.current?.srcObject).not.toBeNull();
  });
});
