import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTorch, type TorchControl } from './use-torch';

interface FakeTrackOptions {
  torch?: boolean;
  noCapabilities?: boolean;
  fail?: boolean;
}

function fakeTrack({ torch = true, noCapabilities = false, fail = false }: FakeTrackOptions = {}) {
  const target = new EventTarget();
  const applied: Array<boolean | undefined> = [];
  const state = { readyState: 'live' as MediaStreamTrackState, fail };
  const applyConstraints = vi.fn((constraints: MediaTrackConstraints) => {
    const advanced = constraints.advanced?.[0] as { torch?: boolean } | undefined;
    applied.push(advanced?.torch);
    return state.fail ? Promise.reject(new DOMException('nope', 'OverconstrainedError')) : Promise.resolve();
  });
  Object.defineProperty(target, 'readyState', { get: () => state.readyState });
  const track = Object.assign(target, {
    kind: 'video',
    applyConstraints,
    ...(noCapabilities ? {} : { getCapabilities: () => (torch ? { torch: true } : {}) }),
  }) as unknown as MediaStreamTrack;
  const end = () => {
    state.readyState = 'ended';
    target.dispatchEvent(new Event('ended'));
  };
  return { track, applied, applyConstraints, state, end };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTorch', () => {
  it('reports unsupported when there is no track', () => {
    const { result } = renderHook(() => useTorch(null));
    expect(result.current.supported).toBe(false);
    expect(result.current.on).toBe(false);
  });

  it('reports unsupported when the track has no torch capability', () => {
    const { track } = fakeTrack({ torch: false });
    const { result } = renderHook(() => useTorch(track));
    expect(result.current.supported).toBe(false);
  });

  it('reports unsupported when getCapabilities is missing', () => {
    const { track } = fakeTrack({ noCapabilities: true });
    const { result } = renderHook(() => useTorch(track));
    expect(result.current.supported).toBe(false);
  });

  it('turns the torch on and off with applyConstraints', async () => {
    const { track, applied } = fakeTrack();
    const { result } = renderHook(() => useTorch(track));
    expect(result.current.supported).toBe(true);

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.on).toBe(true);
    expect(applied).toEqual([true]);

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.on).toBe(false);
    expect(applied).toEqual([true, false]);
  });

  it('keeps the torch off when applyConstraints rejects', async () => {
    const { track } = fakeTrack({ fail: true });
    const { result } = renderHook(() => useTorch(track));

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.on).toBe(false);
  });

  it('re-applies the torch on a new camera track that supports it', async () => {
    const first = fakeTrack();
    const second = fakeTrack();
    const { result, rerender } = renderHook(({ track }) => useTorch(track), { initialProps: { track: first.track } });
    await act(async () => {
      await result.current.toggle();
    });

    rerender({ track: second.track });

    await waitFor(() => expect(result.current.on).toBe(true));
    expect(second.applied).toEqual([true]);
    expect(result.current.supported).toBe(true);
  });

  it('hides and resets when the new camera track has no torch', async () => {
    const first = fakeTrack();
    const second = fakeTrack({ torch: false });
    const { result, rerender } = renderHook(({ track }) => useTorch(track), { initialProps: { track: first.track } });
    await act(async () => {
      await result.current.toggle();
    });

    rerender({ track: second.track });

    expect(result.current.supported).toBe(false);
    expect(result.current.on).toBe(false);
    expect(second.applyConstraints).not.toHaveBeenCalled();

    const third = fakeTrack();
    rerender({ track: third.track });
    expect(result.current.supported).toBe(true);
    expect(result.current.on).toBe(false);
    expect(third.applyConstraints).not.toHaveBeenCalled();
  });

  it('turns the torch off on the previous track when the camera switches', async () => {
    const first = fakeTrack();
    const second = fakeTrack({ torch: false });
    const { result, rerender } = renderHook(({ track }) => useTorch(track), { initialProps: { track: first.track } });
    await act(async () => {
      await result.current.toggle();
    });

    rerender({ track: second.track });

    expect(first.applied).toEqual([true, false]);
  });

  it('marks the torch off when re-applying on the new track fails', async () => {
    const first = fakeTrack();
    const second = fakeTrack({ fail: true });
    const { result, rerender } = renderHook(({ track }) => useTorch(track), { initialProps: { track: first.track } });
    await act(async () => {
      await result.current.toggle();
    });

    rerender({ track: second.track });

    await waitFor(() => expect(result.current.on).toBe(false));
    expect(result.current.supported).toBe(true);
  });

  it('resets when the camera turns off and starts off when it turns back on', async () => {
    const first = fakeTrack();
    const { result, rerender } = renderHook<TorchControl, { track: MediaStreamTrack | null }>(({ track }) => useTorch(track), { initialProps: { track: first.track } });
    await act(async () => {
      await result.current.toggle();
    });

    rerender({ track: null });
    expect(result.current.supported).toBe(false);
    expect(result.current.on).toBe(false);

    const second = fakeTrack();
    rerender({ track: second.track });
    expect(result.current.supported).toBe(true);
    expect(result.current.on).toBe(false);
    expect(second.applyConstraints).not.toHaveBeenCalled();
  });

  it('turns the torch off before the camera stops', async () => {
    const { track, applied } = fakeTrack();
    const { result } = renderHook(() => useTorch(track));
    await act(async () => {
      await result.current.toggle();
    });

    act(() => {
      result.current.release();
    });

    expect(applied).toEqual([true, false]);
    expect(result.current.on).toBe(false);
  });

  it('turns the torch off on hangup through release and on unmount', async () => {
    const { track, applied } = fakeTrack();
    const { result, unmount } = renderHook(() => useTorch(track));
    await act(async () => {
      await result.current.toggle();
    });

    unmount();

    expect(applied).toEqual([true, false]);
  });

  it('does not touch an ended track on unmount', async () => {
    const { track, applied, state } = fakeTrack();
    const { result, unmount } = renderHook(() => useTorch(track));
    await act(async () => {
      await result.current.toggle();
    });
    state.readyState = 'ended';

    unmount();

    expect(applied).toEqual([true]);
  });

  it('hides when the track ends', async () => {
    const { track, end } = fakeTrack();
    const { result } = renderHook(() => useTorch(track));
    await act(async () => {
      await result.current.toggle();
    });

    act(() => end());

    expect(result.current.supported).toBe(false);
    expect(result.current.on).toBe(false);
  });

  it('re-applies the torch when the app returns from the background', async () => {
    const { track, applied } = fakeTrack();
    const { result } = renderHook(() => useTorch(track));
    await act(async () => {
      await result.current.toggle();
    });
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    visibility.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(applied).toEqual([true, true]);
    expect(result.current.on).toBe(true);
  });

  it('does not apply anything on return from the background when the torch is off', async () => {
    const { track, applyConstraints } = fakeTrack();
    renderHook(() => useTorch(track));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(applyConstraints).not.toHaveBeenCalled();
  });

  it('ignores a toggle result that lands after the camera switched', async () => {
    const first = fakeTrack();
    let resolveFirst: () => void = () => undefined;
    first.applyConstraints.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveFirst = resolve;
    }));
    const second = fakeTrack({ torch: false });
    const { result, rerender } = renderHook(({ track }) => useTorch(track), { initialProps: { track: first.track } });

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.toggle();
    });
    rerender({ track: second.track });
    await act(async () => {
      resolveFirst();
      await pending;
    });

    expect(result.current.on).toBe(false);
    expect(result.current.supported).toBe(false);
  });
});
