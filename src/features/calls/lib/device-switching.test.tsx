import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireDeviceTrack, videoConstraints } from './media-devices';
import { devicePrefs } from './call-settings';
import { deviceFallback } from './device-watch';
import { routeCallOutput } from './audio-output';

function device(kind: MediaDeviceKind, deviceId: string, groupId = deviceId): MediaDeviceInfo {
  return { kind, deviceId, groupId, label: deviceId, toJSON: () => ({}) };
}

function track(kind: 'audio' | 'video', deviceId: string, groupId = deviceId, readyState: MediaStreamTrackState = 'live'): MediaStreamTrack {
  return { kind, readyState, getSettings: () => ({ deviceId, groupId }) } as unknown as MediaStreamTrack;
}

afterEach(() => {
  localStorage.clear();
});

describe('camera constraints', () => {
  it('asks for the exact chosen camera without forcing a facing mode', () => {
    expect(videoConstraints(true, 'back-cam')).toMatchObject({ deviceId: { exact: 'back-cam' } });
    expect(videoConstraints(true, 'back-cam')).not.toHaveProperty('facingMode');
  });

  it('uses the remembered facing mode on phones when no camera was picked', () => {
    expect(videoConstraints(true, undefined, 'environment')).toMatchObject({ facingMode: 'environment' });
    expect(videoConstraints(true)).toMatchObject({ facingMode: 'user' });
    expect(videoConstraints(false, undefined, 'environment')).not.toHaveProperty('facingMode');
  });
});

describe('acquireDeviceTrack', () => {
  it('opens the chosen device', async () => {
    const opened = track('video', 'cam-b');
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [opened] });
    await expect(acquireDeviceTrack((id) => ({ video: { deviceId: id ? { exact: id } : undefined } }), 'cam-b', getUserMedia)).resolves.toBe(opened);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default device when the chosen one is gone', async () => {
    const opened = track('audio', 'default');
    const getUserMedia = vi.fn().mockRejectedValueOnce(Object.assign(new Error('gone'), { name: 'OverconstrainedError' })).mockResolvedValueOnce({ getTracks: () => [opened] });
    const build = vi.fn((id?: string) => ({ audio: id ? { deviceId: { exact: id } } : true }));
    await expect(acquireDeviceTrack(build, 'unplugged', getUserMedia)).resolves.toBe(opened);
    expect(build).toHaveBeenLastCalledWith(undefined);
  });

  it('returns null when nothing can be opened', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('busy'));
    await expect(acquireDeviceTrack(() => ({ video: true }), 'cam', getUserMedia)).resolves.toBeNull();
  });
});

describe('device preferences', () => {
  it('remembers the chosen devices across reloads and notifies listeners', () => {
    const listener = vi.fn();
    const stop = devicePrefs.subscribe(listener);
    devicePrefs.set({ videoInput: 'cam-b', facing: 'environment' });
    devicePrefs.set({ audioOutput: 'headset' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(devicePrefs.get()).toEqual({ audioInput: '', videoInput: 'cam-b', audioOutput: 'headset', facing: 'environment' });
    stop();
  });

  it('ignores corrupted stored values', () => {
    localStorage.setItem('chatCallDevices', JSON.stringify({ audioInput: 3, videoInput: 'cam', facing: 'sideways' }));
    expect(devicePrefs.get()).toEqual({ audioInput: '', videoInput: 'cam', audioOutput: '', facing: 'user' });
  });
});

describe('deviceFallback', () => {
  const lists = {
    audioInputs: [device('audioinput', 'default', 'g-headset'), device('audioinput', 'mic-laptop', 'g-laptop'), device('audioinput', 'headset', 'g-headset')],
    videoInputs: [device('videoinput', 'cam-a')],
    audioOutputs: [device('audiooutput', 'default', 'g-headset'), device('audiooutput', 'speaker')],
  };

  it('keeps everything when the active devices are still there', () => {
    expect(deviceFallback(lists, { mic: track('audio', 'mic-laptop', 'g-laptop'), camera: track('video', 'cam-a'), prefs: { audioInput: 'mic-laptop', videoInput: '', audioOutput: 'speaker', facing: 'user' } })).toEqual({ mic: false, camera: false, output: 'speaker' });
  });

  it('switches the microphone when the active one was unplugged or ended', () => {
    const prefs = { audioInput: 'usb-mic', videoInput: '', audioOutput: '', facing: 'user' as const };
    expect(deviceFallback(lists, { mic: track('audio', 'usb-mic'), camera: null, prefs }).mic).toBe(true);
    expect(deviceFallback(lists, { mic: track('audio', 'mic-laptop', 'g-laptop', 'ended'), camera: null, prefs }).mic).toBe(true);
  });

  it('moves to the preferred microphone again when it is plugged back in', () => {
    const prefs = { audioInput: 'headset', videoInput: '', audioOutput: '', facing: 'user' as const };
    expect(deviceFallback(lists, { mic: track('audio', 'mic-laptop', 'g-laptop'), camera: null, prefs }).mic).toBe(true);
  });

  it('follows the system default microphone when a headset becomes the default', () => {
    const prefs = { audioInput: '', videoInput: '', audioOutput: '', facing: 'user' as const };
    expect(deviceFallback(lists, { mic: track('audio', 'default', 'g-laptop'), camera: null, prefs }).mic).toBe(true);
    expect(deviceFallback(lists, { mic: track('audio', 'default', 'g-headset'), camera: null, prefs }).mic).toBe(false);
  });

  it('switches the camera when the active one disappears and uses the default speaker when the chosen one is gone', () => {
    const prefs = { audioInput: '', videoInput: 'usb-cam', audioOutput: 'bt-speaker', facing: 'user' as const };
    expect(deviceFallback(lists, { mic: null, camera: track('video', 'usb-cam'), prefs })).toEqual({ mic: false, camera: true, output: '' });
  });

  it('does not touch anything when the browser returns an empty list', () => {
    const empty = { audioInputs: [], videoInputs: [], audioOutputs: [] };
    expect(deviceFallback(empty, { mic: track('audio', 'mic'), camera: track('video', 'cam'), prefs: { audioInput: 'mic', videoInput: 'cam', audioOutput: 'spk', facing: 'user' } })).toEqual({ mic: false, camera: false, output: 'spk' });
  });
});

describe('routeCallOutput', () => {
  function sinkable(tag: 'audio' | 'video', attribute: string) {
    const element = document.createElement(tag);
    element.setAttribute(attribute, '');
    const calls: string[] = [];
    Object.defineProperty(element, 'sinkId', { value: '', writable: true });
    Object.defineProperty(element, 'setSinkId', {
      value: (id: string) => {
        calls.push(id);
        (element as unknown as { sinkId: string }).sinkId = id;
        return Promise.resolve();
      },
    });
    return { element, calls };
  }

  it('sends every call media element to the chosen speaker, including ones added later', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const voice = sinkable('audio', 'data-call-audio');
    const other = sinkable('audio', 'data-unrelated');
    root.append(voice.element, other.element);
    let sink = 'headset';
    const stop = routeCallOutput(root, () => sink);
    expect(voice.calls).toEqual(['headset']);
    expect(other.calls).toEqual([]);

    const later = sinkable('video', 'data-call-media');
    const wrapper = document.createElement('div');
    wrapper.append(later.element);
    root.append(wrapper);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(later.calls).toEqual(['headset']);

    sink = '';
    stop.refresh();
    expect(voice.calls).toEqual(['headset', '']);
    expect(later.calls).toEqual(['headset', '']);
    stop.dispose();
    root.remove();
  });
});
