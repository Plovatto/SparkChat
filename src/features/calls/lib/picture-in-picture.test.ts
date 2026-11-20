import { describe, expect, it } from 'vitest';
import { STREAM_WINDOW_SIZE, pipMode, registerAutoPip, streamWindowMode, type DocumentPipHost } from './picture-in-picture';

const host: DocumentPipHost = { requestWindow: () => Promise.reject(new Error('x')), window: null };

describe('pipMode', () => {
  it('prefers Document Picture-in-Picture', () => {
    expect(pipMode({ documentPictureInPicture: host, pictureInPictureEnabled: true, videoPip: true })).toBe('document');
  });

  it('falls back to video Picture-in-Picture', () => {
    expect(pipMode({ pictureInPictureEnabled: true, videoPip: true })).toBe('video');
  });

  it('hides the button where neither exists or video PiP is disabled', () => {
    expect(pipMode({})).toBeNull();
    expect(pipMode({ pictureInPictureEnabled: false, videoPip: true })).toBeNull();
    expect(pipMode({ pictureInPictureEnabled: true, videoPip: false })).toBeNull();
  });
});

describe('registerAutoPip', () => {
  it('registers and removes the enterpictureinpicture media session action', () => {
    const actions = new Map<string, (() => void) | null>();
    const handler = () => undefined;
    const undo = registerAutoPip(handler, { setActionHandler: (action, value) => void actions.set(action, value) });
    expect(actions.get('enterpictureinpicture')).toBe(handler);
    undo();
    expect(actions.get('enterpictureinpicture')).toBeNull();
  });

  it('is a no-op when the browser rejects the action or has no media session', () => {
    const undo = registerAutoPip(() => undefined, {
      setActionHandler: () => {
        throw new TypeError('unsupported');
      },
    });
    expect(() => undo()).not.toThrow();
    expect(() => registerAutoPip(() => undefined, undefined)()).not.toThrow();
  });
});

describe('streamWindowMode', () => {
  it('opens a large Document Picture-in-Picture window when available, else falls back to fullscreen', () => {
    expect(streamWindowMode({ documentPictureInPicture: host, fullscreenEnabled: true })).toBe('document');
    expect(streamWindowMode({ fullscreenEnabled: true })).toBe('fullscreen');
    expect(streamWindowMode({ fullscreenEnabled: false })).toBeNull();
    expect(STREAM_WINDOW_SIZE).toEqual({ width: 960, height: 540 });
  });
});
