import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStreamOn, useVideoOnly } from './call-hooks';

function fakeStream() {
  const tracks: Array<{ id: string }> = [{ id: 'cam-a' }];
  return {
    tracks,
    stream: { getTracks: () => [...tracks] } as unknown as MediaStream,
  };
}

describe('useStreamOn', () => {
  it('re-binds the element when the tracks of the same stream change, so a new camera shows at once', () => {
    const element = document.createElement('video');
    const assigned: Array<MediaStream | null> = [];
    let current: MediaProvider | null = null;
    Object.defineProperty(element, 'srcObject', {
      get: () => current,
      set: (value: MediaStream | null) => {
        assigned.push(value);
        current = value;
      },
    });
    Object.defineProperty(element, 'play', { value: () => Promise.resolve() });
    const ref = { current: element };
    const { stream, tracks } = fakeStream();

    const { rerender } = renderHook(() => useStreamOn(ref, stream));
    expect(assigned).toEqual([stream]);

    rerender();
    expect(assigned).toEqual([stream]);

    tracks.splice(0, 1, { id: 'cam-b' });
    rerender();
    expect(assigned).toEqual([stream, null, stream]);
  });

  function boundElement() {
    const element = document.createElement('video');
    const assigned: Array<MediaStream | null> = [];
    let current: MediaProvider | null = null;
    let width = 0;
    let paused = false;
    const plays: number[] = [];
    Object.defineProperty(element, 'srcObject', {
      get: () => current,
      set: (value: MediaStream | null) => {
        assigned.push(value);
        current = value;
      },
    });
    Object.defineProperty(element, 'videoWidth', { get: () => width });
    Object.defineProperty(element, 'paused', { get: () => paused });
    Object.defineProperty(element, 'play', {
      value: () => {
        plays.push(1);
        paused = false;
        return Promise.resolve();
      },
    });
    return {
      element,
      assigned,
      plays,
      setWidth: (value: number) => (width = value),
      pause: () => {
        paused = true;
        element.dispatchEvent(new Event('pause'));
      },
    };
  }

  function videoStream() {
    const track = Object.assign(new EventTarget(), { id: 'cam', kind: 'video' });
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    return { track, stream };
  }

  it('re-binds a camera that starts sending frames after the element was bound', () => {
    const bound = boundElement();
    const { track, stream } = videoStream();
    renderHook(() => useStreamOn({ current: bound.element }, stream));
    expect(bound.assigned).toEqual([stream]);

    track.dispatchEvent(new Event('unmute'));
    expect(bound.assigned).toEqual([stream, null, stream]);

    bound.setWidth(640);
    track.dispatchEvent(new Event('unmute'));
    expect(bound.assigned).toEqual([stream, null, stream]);
  });

  it('resumes a live camera preview that the browser paused', () => {
    const bound = boundElement();
    const { stream } = videoStream();
    renderHook(() => useStreamOn({ current: bound.element }, stream));
    const before = bound.plays.length;

    bound.pause();
    expect(bound.plays.length).toBe(before + 1);
  });

  it('stops listening once the stream is gone', () => {
    const bound = boundElement();
    const { track, stream } = videoStream();
    const { rerender } = renderHook<void, { value: MediaStream | null }>(({ value }) => useStreamOn({ current: bound.element }, value), { initialProps: { value: stream } });
    rerender({ value: null });
    const count = bound.assigned.length;
    track.dispatchEvent(new Event('unmute'));
    bound.pause();
    expect(bound.assigned.length).toBe(count);
  });
});

describe('useVideoOnly', () => {
  it('keeps one video only stream per camera track and drops the audio', () => {
    const created: MediaStreamTrack[][] = [];
    class FakeMediaStream {
      constructor(public readonly tracks: MediaStreamTrack[]) {
        created.push(tracks);
      }
    }
    const original = globalThis.MediaStream;
    globalThis.MediaStream = FakeMediaStream as unknown as typeof MediaStream;
    try {
      const camA = { id: 'a', kind: 'video' } as MediaStreamTrack;
      const camB = { id: 'b', kind: 'video' } as MediaStreamTrack;
      const source = (video: MediaStreamTrack | null) => ({ getVideoTracks: () => (video ? [video] : []) }) as unknown as MediaStream;
      const { result, rerender } = renderHook<MediaStream | null, { value: MediaStream | null }>(({ value }) => useVideoOnly(value), { initialProps: { value: source(camA) } });
      const first = result.current;
      rerender({ value: source(camA) });
      expect(result.current).toBe(first);
      expect(created).toEqual([[camA]]);
      rerender({ value: source(camB) });
      expect(result.current).not.toBe(first);
      expect(created).toEqual([[camA], [camB]]);
      rerender({ value: null });
      expect(result.current).toBeNull();
    } finally {
      globalThis.MediaStream = original;
    }
  });
});
