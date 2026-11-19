import { describe, expect, it, vi } from 'vitest';
import { acquireLocalMedia, audioConstraints, videoConstraints } from './media-devices';

const stream = (name: string) => ({ name }) as unknown as MediaStream;

describe('constraints', () => {
  it('asks for echo cancellation, noise suppression, auto gain and mono audio', () => {
    expect(audioConstraints()).toMatchObject({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 });
    expect(audioConstraints('mic-1')).toMatchObject({ deviceId: { exact: 'mic-1' } });
  });

  it('follows the chosen audio processing options', () => {
    const off = { noiseSuppression: false, echoCancellation: false, autoGainControl: false, voiceIsolation: false };
    expect(audioConstraints(undefined, off)).toMatchObject({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    expect(audioConstraints(undefined, { ...off, noiseSuppression: true })).toMatchObject({ noiseSuppression: true, echoCancellation: false });
    expect(audioConstraints(undefined, off)).not.toHaveProperty('voiceIsolation');
  });

  it('only asks for voice isolation when the browser supports it', () => {
    const processing = { noiseSuppression: true, echoCancellation: true, autoGainControl: true, voiceIsolation: true };
    expect(audioConstraints(undefined, processing)).not.toHaveProperty('voiceIsolation');
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: { getSupportedConstraints: () => ({ voiceIsolation: true }) }, configurable: true });
    try {
      expect(audioConstraints(undefined, processing)).toMatchObject({ voiceIsolation: true });
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { value: original, configurable: true });
    }
  });

  it('prefers 720p30 on desktop and 480p on mobile', () => {
    expect(videoConstraints(false)).toMatchObject({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } });
    expect(videoConstraints(true)).toMatchObject({ width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' });
  });
});

describe('acquireLocalMedia', () => {
  it('captures audio only for voice calls', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(stream('a'));

    const media = await acquireLocalMedia('voice', {}, getUserMedia, false);

    expect(media.cameraFailed).toBe(false);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: expect.any(Object) as unknown, video: false });
  });

  it('captures audio and video for video calls', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(stream('av'));

    const media = await acquireLocalMedia('video', {}, getUserMedia, false);

    expect(media.cameraFailed).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect((getUserMedia.mock.calls[0]?.[0] as { video: unknown }).video).toMatchObject({ width: { ideal: 1280 } });
  });

  it('falls back to audio when the camera fails', async () => {
    const getUserMedia = vi.fn().mockRejectedValueOnce(new Error('camera busy')).mockResolvedValueOnce(stream('a'));

    const media = await acquireLocalMedia('video', {}, getUserMedia, false);

    expect(media.cameraFailed).toBe(true);
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: expect.any(Object) as unknown, video: false });
  });

  it('fails when the microphone is unavailable', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('denied'));

    await expect(acquireLocalMedia('video', {}, getUserMedia, false)).rejects.toThrow('denied');
  });
});
