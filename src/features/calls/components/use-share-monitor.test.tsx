import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stop = vi.fn();
const setVolume = vi.fn();
const start = vi.fn();

vi.mock('../lib/share-monitor', () => ({
  startShareMonitor: (...args: unknown[]) => {
    start(...args);
    return { stop, setVolume };
  },
}));

import { useShareMonitor } from './use-share-monitor';

describe('useShareMonitor', () => {
  beforeEach(() => {
    stop.mockClear();
    setVolume.mockClear();
    start.mockClear();
  });

  it('does nothing without a track', () => {
    const ref = { current: document.createElement('audio') };
    renderHook(() => useShareMonitor(ref, null, 1));
    expect(start).not.toHaveBeenCalled();
  });

  it('starts with the track, follows volume and stops on unmount', () => {
    const ref = { current: document.createElement('audio') };
    const track = {} as MediaStreamTrack;
    const { rerender, unmount } = renderHook(({ volume }) => useShareMonitor(ref, track, volume), { initialProps: { volume: 0.8 } });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.[2]).toBe(0.8);
    rerender({ volume: 0.12 });
    expect(setVolume).toHaveBeenLastCalledWith(0.12);
    expect(start).toHaveBeenCalledTimes(1);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops when the track goes away', () => {
    const ref = { current: document.createElement('audio') };
    const makeTrack = (): MediaStreamTrack | null => ({}) as MediaStreamTrack;
    const { rerender } = renderHook(({ t }) => useShareMonitor(ref, t, 1), { initialProps: { t: makeTrack() } });
    rerender({ t: null });
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
