import { describe, expect, it, vi } from 'vitest';
import { SHARE_AUDIO_CONSTRAINTS, acquireLocalMedia, acquireScreenShare, applyShareConstraints, shareVideoConstraints, audioConstraints, screenShareOptions, supportsScreenShare, videoConstraints } from './media-devices';

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

describe('screen share', () => {
  function fakeStream(kinds: string[]) {
    const tracks = kinds.map((kind) => ({ kind, stopped: false, stop() { this.stopped = true; } }));
    return { tracks, getTracks: () => tracks, getVideoTracks: () => tracks.filter((track) => track.kind === 'video') } as unknown as MediaStream & { tracks: Array<{ stopped: boolean }> };
  }

  it('offers the button only where getDisplayMedia exists', () => {
    expect(supportsScreenShare({ getDisplayMedia: () => Promise.reject(new Error('x')) })).toBe(true);
    expect(supportsScreenShare({})).toBe(false);
    expect(supportsScreenShare(undefined)).toBe(false);
  });

  it('asks for a tab, window or screen with audio and excludes the app tab itself', () => {
    expect((screenShareOptions().audio as Record<string, unknown>).restrictOwnAudio).toBe(true);
    expect(screenShareOptions()).toMatchObject({
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      systemAudio: 'include',
      monitorTypeSurfaces: 'include',
    });
    expect(screenShareOptions().video).not.toHaveProperty('displaySurface');
  });

  it('returns the stream, or null when the picker is cancelled or gives no video', async () => {
    const stream = fakeStream(['video', 'audio']);
    expect(await acquireScreenShare({ getDisplayMedia: () => Promise.resolve(stream) })).toBe(stream);
    expect(await acquireScreenShare({ getDisplayMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')) })).toBeNull();
    const audioOnly = fakeStream(['audio']);
    expect(await acquireScreenShare({ getDisplayMedia: () => Promise.resolve(audioOnly) })).toBeNull();
    expect(audioOnly.tracks[0]?.stopped).toBe(true);
    expect(await acquireScreenShare({})).toBeNull();
  });
});

describe('share constraints', () => {
  it('asks for 30 fps up to 4K in movie mode and turns off voice processing on share audio', async () => {
    const applied: Array<{ kind: string; constraints: MediaTrackConstraints }> = [];
    const track = (kind: string) => ({ kind, applyConstraints: (constraints: MediaTrackConstraints) => { applied.push({ kind, constraints }); return Promise.resolve(); } });
    const video = track('video');
    const audio = track('audio');
    const stream = { getVideoTracks: () => [video], getAudioTracks: () => [audio] } as unknown as MediaStream;

    await applyShareConstraints(stream, true);
    expect(applied[0]).toEqual({ kind: 'video', constraints: { frameRate: { ideal: 30, max: 30 }, width: { max: 3840 }, height: { max: 2160 } } });
    expect(applied[1]).toEqual({ kind: 'audio', constraints: SHARE_AUDIO_CONSTRAINTS });
    expect(SHARE_AUDIO_CONSTRAINTS).toEqual({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    expect(shareVideoConstraints(false)).toEqual({ frameRate: { ideal: 15, max: 30 } });
  });

  it('ignores tracks that reject the constraints', async () => {
    const stream = { getVideoTracks: () => [{ applyConstraints: () => Promise.reject(new Error('x')) }], getAudioTracks: () => [] } as unknown as MediaStream;
    await expect(applyShareConstraints(stream, true)).resolves.toBeUndefined();
  });
});
