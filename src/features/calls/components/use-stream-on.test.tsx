import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStreamOn } from './call-hooks';

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
});
