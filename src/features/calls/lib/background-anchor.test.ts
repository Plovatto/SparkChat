import { describe, expect, it, vi } from 'vitest';
import { ANCHOR_SAMPLE_RATE, ANCHOR_SECONDS, anchorWav, needsBackgroundAnchor, startBackgroundAnchor, type AnchorDeps, type AnchorElement } from './background-anchor';

class FakeElement implements AnchorElement {
  src = '';
  loop = false;
  muted = true;
  volume = 0;
  paused = true;
  preload = '';
  attributes = new Map<string, string>();
  plays = 0;
  loads = 0;
  reject: Error | null = null;
  private pauseListeners = new Set<() => void>();

  play = vi.fn(() => {
    this.plays += 1;
    if (this.reject) {
      return Promise.reject(this.reject);
    }
    this.paused = false;
    return Promise.resolve();
  });

  pause = vi.fn(() => {
    this.paused = true;
    for (const listener of Array.from(this.pauseListeners)) {
      listener();
    }
  });

  load = vi.fn(() => {
    this.loads += 1;
  });

  removeAttribute = (name: string) => {
    this.attributes.delete(name);
    if (name === 'src') {
      this.src = '';
    }
  };

  setAttribute = (name: string, value: string) => {
    this.attributes.set(name, value);
  };

  addEventListener = (_type: 'pause', listener: () => void) => {
    this.pauseListeners.add(listener);
  };

  removeEventListener = (_type: 'pause', listener: () => void) => {
    this.pauseListeners.delete(listener);
  };

  systemPause() {
    this.pause();
  }

  get listenerCount() {
    return this.pauseListeners.size;
  }
}

function fakeSource() {
  const docListeners = new Map<string, Set<() => void>>();
  const winListeners = new Map<string, Set<() => void>>();
  const add = (map: Map<string, Set<() => void>>) => (type: string, listener: EventListenerOrEventListenerObject) => {
    const set = map.get(type) ?? new Set();
    set.add(listener as () => void);
    map.set(type, set);
  };
  const remove = (map: Map<string, Set<() => void>>) => (type: string, listener: EventListenerOrEventListenerObject) => {
    map.get(type)?.delete(listener as () => void);
  };
  const doc = { visibilityState: 'hidden' as DocumentVisibilityState, addEventListener: add(docListeners), removeEventListener: remove(docListeners) };
  const source = { document: doc, window: { addEventListener: add(winListeners), removeEventListener: remove(winListeners) } };
  const fire = (type: string) => {
    for (const listener of Array.from(docListeners.get(type) ?? [])) {
      listener();
    }
    for (const listener of Array.from(winListeners.get(type) ?? [])) {
      listener();
    }
  };
  const count = () => [...docListeners.values(), ...winListeners.values()].reduce((total, set) => total + set.size, 0);
  return { source, doc, fire, count };
}

function harness(element = new FakeElement()) {
  const timers: Array<{ callback: () => void; ms: number; cleared: boolean }> = [];
  const revoked: string[] = [];
  const page = fakeSource();
  const interactions = fakeSource();
  const clock = { now: 0 };
  const deps: Partial<AnchorDeps> = {
    createElement: () => element,
    createUrl: () => 'blob:anchor',
    revokeUrl: (url) => revoked.push(url),
    setTimer: (callback, ms) => {
      const timer = { callback, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
    now: () => clock.now,
    source: page.source,
    interactions: interactions.source.document,
  };
  const runTimers = () => {
    for (const timer of timers.splice(0)) {
      if (!timer.cleared) {
        timer.callback();
      }
    }
  };
  return { element, deps, timers, revoked, page, interactions, runTimers, clock };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('needsBackgroundAnchor', () => {
  it('anchors Android browsers only', () => {
    expect(needsBackgroundAnchor('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36')).toBe(true);
    expect(needsBackgroundAnchor('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')).toBe(false);
    expect(needsBackgroundAnchor('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36')).toBe(false);
    expect(needsBackgroundAnchor(undefined)).toBe(false);
  });
});

describe('anchorWav', () => {
  it('is a long mono PCM clip so the browser treats it as persistent media, at an inaudible level', () => {
    const bytes = anchorWav();
    const view = new DataView(bytes.buffer);
    const text = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(ANCHOR_SAMPLE_RATE);
    const samples = view.getUint32(40, true) / 2;
    expect(samples / ANCHOR_SAMPLE_RATE).toBe(ANCHOR_SECONDS);
    expect(ANCHOR_SECONDS).toBeGreaterThan(5);
    let peak = 0;
    for (let index = 0; index < samples; index += 1) {
      peak = Math.max(peak, Math.abs(view.getInt16(44 + index * 2, true)));
    }
    expect(peak).toBeGreaterThan(0);
    expect(20 * Math.log10(peak / 32767)).toBeLessThan(-45);
  });
});

describe('startBackgroundAnchor', () => {
  it('plays an unmuted looping element while the page is hidden so it holds an audible media session', async () => {
    const { element, deps } = harness();
    startBackgroundAnchor(deps);
    await flush();
    expect(element.src).toBe('blob:anchor');
    expect(element.loop).toBe(true);
    expect(element.muted).toBe(false);
    expect(element.volume).toBe(1);
    expect(element.paused).toBe(false);
    expect(element.attributes.get('data-call-audio')).toBe('anchor');
  });

  it('plays muted while the call is on screen so the volume keys keep controlling the call volume', async () => {
    const { element, deps, page } = harness();
    page.doc.visibilityState = 'visible';
    startBackgroundAnchor(deps);
    await flush();
    expect(element.paused).toBe(false);
    expect(element.loop).toBe(true);
    expect(element.muted).toBe(true);
  });

  it('turns audible when the app goes to the background without restarting playback', async () => {
    const { element, deps, page } = harness();
    page.doc.visibilityState = 'visible';
    startBackgroundAnchor(deps);
    await flush();
    page.doc.visibilityState = 'hidden';
    page.fire('visibilitychange');
    expect(element.muted).toBe(false);
    expect(element.paused).toBe(false);
    expect(element.plays).toBe(1);
  });

  it('replaces the audible element with a fresh muted one when the app comes back, so the browser drops its media session', async () => {
    const first = new FakeElement();
    const second = new FakeElement();
    const queue = [first, second];
    const { deps, page, revoked, clock } = harness(first);
    deps.createElement = () => queue.shift() ?? null;
    page.doc.visibilityState = 'visible';
    const anchor = startBackgroundAnchor(deps);
    await flush();
    page.doc.visibilityState = 'hidden';
    page.fire('visibilitychange');
    clock.now += 60_000;
    page.doc.visibilityState = 'visible';
    page.fire('visibilitychange');
    await flush();
    expect(first.paused).toBe(true);
    expect(first.src).toBe('');
    expect(first.listenerCount).toBe(0);
    expect(second.src).toBe('blob:anchor');
    expect(second.loop).toBe(true);
    expect(second.muted).toBe(true);
    expect(second.paused).toBe(false);
    expect(second.attributes.get('data-call-audio')).toBe('anchor');
    page.doc.visibilityState = 'hidden';
    page.fire('visibilitychange');
    expect(second.muted).toBe(false);
    expect(second.plays).toBe(1);
    anchor.stop();
    expect(second.paused).toBe(true);
    expect(second.listenerCount).toBe(0);
    expect(revoked).toEqual(['blob:anchor']);
  });

  it('swaps a yielded audible element for a fresh muted one when it is revived on screen', async () => {
    const first = new FakeElement();
    const second = new FakeElement();
    const queue = [first, second];
    const { deps, page, clock } = harness(first);
    deps.createElement = () => queue.shift() ?? null;
    startBackgroundAnchor(deps);
    await flush();
    clock.now += 10_000;
    first.systemPause();
    clock.now += 5_000;
    page.doc.visibilityState = 'visible';
    page.fire('visibilitychange');
    await flush();
    expect(first.plays).toBe(1);
    expect(first.src).toBe('');
    expect(second.muted).toBe(true);
    expect(second.paused).toBe(false);
  });

  it('keeps the same muted element when the app comes back without ever having been audible', async () => {
    const { element, deps, page } = harness();
    let created = 0;
    deps.createElement = () => {
      created += 1;
      return element;
    };
    page.doc.visibilityState = 'visible';
    startBackgroundAnchor(deps);
    await flush();
    page.fire('visibilitychange');
    await flush();
    expect(created).toBe(1);
    expect(element.plays).toBe(1);
    expect(element.muted).toBe(true);
  });

  it('does not treat its own swap as another app taking audio focus', async () => {
    const first = new FakeElement();
    const second = new FakeElement();
    const queue = [first, second];
    const { deps, page, timers, clock } = harness(first);
    deps.createElement = () => queue.shift() ?? null;
    page.doc.visibilityState = 'hidden';
    startBackgroundAnchor(deps);
    await flush();
    clock.now += 60_000;
    page.doc.visibilityState = 'visible';
    page.fire('visibilitychange');
    await flush();
    expect(second.paused).toBe(false);
    clock.now += 60_000;
    second.systemPause();
    clock.now += 2_000;
    page.doc.visibilityState = 'hidden';
    page.fire('visibilitychange');
    expect(timers).toHaveLength(0);
    expect(second.plays).toBe(1);
  });

  it('keeps a revived element muted while the page is visible', async () => {
    const { element, deps, page, interactions, clock } = harness();
    page.doc.visibilityState = 'visible';
    startBackgroundAnchor(deps);
    await flush();
    clock.now += 10_000;
    element.systemPause();
    clock.now += 2_000;
    interactions.fire('pointerdown');
    await flush();
    expect(element.plays).toBe(2);
    expect(element.muted).toBe(true);
  });

  it('yields to another app that pauses stable playback and never replays it on a timer', async () => {
    const { element, deps, timers, runTimers, clock } = harness();
    startBackgroundAnchor(deps);
    await flush();
    clock.now += 60_000;
    element.systemPause();
    expect(timers).toHaveLength(0);
    runTimers();
    await flush();
    expect(element.plays).toBe(1);
    expect(element.paused).toBe(true);
  });

  it('yields even when focus is taken right after playback started', async () => {
    const { element, deps, timers, clock } = harness();
    startBackgroundAnchor(deps);
    await flush();
    clock.now += 100;
    element.systemPause();
    expect(timers).toHaveLength(0);
    expect(element.plays).toBe(1);
  });

  it('comes back after an external pause only on page resume or interaction, not within a second', async () => {
    const { element, deps, page, interactions, clock } = harness();
    startBackgroundAnchor(deps);
    await flush();
    clock.now += 10_000;
    element.systemPause();
    clock.now += 500;
    interactions.fire('pointerdown');
    page.doc.visibilityState = 'visible';
    page.fire('visibilitychange');
    await flush();
    expect(element.plays).toBe(1);
    clock.now += 600;
    interactions.fire('pointerdown');
    await flush();
    expect(element.plays).toBe(2);
    expect(element.paused).toBe(false);
  });

  it('retries a blocked start up to three times with back off, then waits for the user', async () => {
    const element = new FakeElement();
    element.reject = new DOMException('focus', 'NotAllowedError');
    const { deps, timers, runTimers } = harness(element);
    startBackgroundAnchor(deps);
    await flush();
    const delays: number[] = [];
    for (let round = 0; round < 5; round += 1) {
      delays.push(timers[0]?.ms ?? -1);
      runTimers();
      await flush();
    }
    expect(delays).toEqual([1000, 3000, 10000, -1, -1]);
    expect(element.plays).toBe(4);
  });

  it('revives on page resume and on the next interaction', async () => {
    const element = new FakeElement();
    element.reject = new DOMException('blocked', 'NotAllowedError');
    const { deps, page, interactions } = harness(element);
    startBackgroundAnchor(deps);
    await flush();
    element.reject = null;
    page.doc.visibilityState = 'visible';
    page.fire('visibilitychange');
    await flush();
    expect(element.paused).toBe(false);
    element.paused = true;
    interactions.fire('pointerdown');
    await flush();
    expect(element.plays).toBe(3);
  });

  it('releases the element, url, timers and listeners when stopped, without replaying', async () => {
    const { element, deps, revoked, page, interactions, timers } = harness();
    const anchor = startBackgroundAnchor(deps);
    await flush();
    anchor.stop();
    expect(element.paused).toBe(true);
    expect(element.src).toBe('');
    expect(element.loads).toBe(1);
    expect(revoked).toEqual(['blob:anchor']);
    expect(timers).toHaveLength(0);
    expect(element.listenerCount).toBe(0);
    expect(page.count()).toBe(0);
    expect(interactions.count()).toBe(0);
    anchor.revive();
    anchor.stop();
    expect(element.plays).toBe(1);
  });

  it('is a no-op when audio elements are unavailable', () => {
    const anchor = startBackgroundAnchor({ createElement: () => null });
    expect(() => {
      anchor.revive();
      anchor.stop();
    }).not.toThrow();
  });
});
