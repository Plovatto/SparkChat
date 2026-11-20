import { describe, expect, it, vi } from 'vitest';
import { keepElementsPlaying, type PlaybackElement } from './media-playback';

class Target extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
}

class FakeElement extends EventTarget {
  srcObject: MediaProvider | null = {} as MediaProvider;
  paused = false;
  ended = false;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });

  pauseFromBrowser(): void {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

function setup() {
  const doc = new Target();
  const win = new Target();
  const voice = new FakeElement();
  const share = new FakeElement();
  const play = vi.fn((element: PlaybackElement) => void element.play());
  const stop = keepElementsPlaying(() => [voice, share, null], {
    play,
    source: { document: doc, window: win },
  });
  return { doc, win, voice, share, play, stop };
}

describe('keepElementsPlaying', () => {
  it('never pauses anything when the page is hidden', () => {
    const { doc, voice, share } = setup();
    const pause = vi.fn();
    Object.assign(voice, { pause });
    Object.assign(share, { pause });

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));

    expect(pause).not.toHaveBeenCalled();
    expect(voice.paused).toBe(false);
    expect(share.paused).toBe(false);
  });

  it('restarts an element the browser paused while the page was in the background', () => {
    const { doc, voice, share } = setup();
    voice.paused = true;

    doc.dispatchEvent(new Event('visibilitychange'));

    expect(voice.play).toHaveBeenCalledTimes(1);
    expect(share.play).not.toHaveBeenCalled();
  });

  it('restarts an element right away when the browser pauses it', () => {
    const { voice } = setup();
    voice.pauseFromBrowser();
    expect(voice.play).toHaveBeenCalledTimes(1);
  });

  it('leaves elements without a source alone and resumes on pageshow and resume', () => {
    const { doc, win, voice, share } = setup();
    share.srcObject = null;
    share.paused = true;
    voice.paused = true;

    win.dispatchEvent(new Event('pageshow'));
    doc.dispatchEvent(new Event('resume'));

    expect(share.play).not.toHaveBeenCalled();
    expect(voice.play).toHaveBeenCalledTimes(1);
  });

  it('stops watching after cleanup', () => {
    const { doc, voice, stop } = setup();
    stop();
    voice.pauseFromBrowser();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(voice.play).not.toHaveBeenCalled();
  });
});
