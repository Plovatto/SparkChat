import { describe, expect, it, vi } from 'vitest';
import { drawFrame, watchTrackMute, type FrameTarget } from './frozen-frame';

function canvas(context: ReturnType<FrameTarget['getContext']>): FrameTarget {
  return { width: 0, height: 0, getContext: () => context };
}

describe('drawFrame', () => {
  it('copies the current frame at the video size', () => {
    const drawImage = vi.fn();
    const target = canvas({ drawImage });
    const video = { videoWidth: 1280, videoHeight: 720 };

    expect(drawFrame(video, target)).toBe(true);
    expect(target.width).toBe(1280);
    expect(target.height).toBe(720);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
  });

  it('refuses when there is no frame, no context or drawing fails', () => {
    const drawImage = vi.fn();
    expect(drawFrame({ videoWidth: 0, videoHeight: 0 }, canvas({ drawImage }))).toBe(false);
    expect(drawImage).not.toHaveBeenCalled();
    expect(drawFrame({ videoWidth: 4, videoHeight: 4 }, canvas(null))).toBe(false);
    expect(
      drawFrame(
        { videoWidth: 4, videoHeight: 4 },
        canvas({
          drawImage: () => {
            throw new Error('tainted');
          },
        }),
      ),
    ).toBe(false);
  });
});

describe('watchTrackMute', () => {
  it('reports mute and unmute from every track and stops after cleanup', () => {
    const listeners = new Map<string, Array<() => void>>();
    const track = {
      addEventListener: (type: string, listener: () => void) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
      removeEventListener: (type: string, listener: () => void) => listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener)),
    };
    const onMute = vi.fn();
    const onUnmute = vi.fn();
    const stop = watchTrackMute([track, track], onMute, onUnmute);

    listeners.get('mute')?.forEach((listener) => listener());
    listeners.get('unmute')?.forEach((listener) => listener());
    expect(onMute).toHaveBeenCalledTimes(2);
    expect(onUnmute).toHaveBeenCalledTimes(2);

    stop();
    expect(listeners.get('mute')).toEqual([]);
    expect(listeners.get('unmute')).toEqual([]);
  });
});
