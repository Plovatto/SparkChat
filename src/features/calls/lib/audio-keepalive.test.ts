import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepAudioContextRunning, trackedContextCount, type ResumableContext } from './audio-keepalive';
import type { ResumeSource } from './page-resume';

class Target extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
}

class FakeContext extends EventTarget implements ResumableContext {
  state = 'running';
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
}

const releases: Array<() => void> = [];

function track(context: ResumableContext, source: ResumeSource) {
  const release = keepAudioContextRunning(context, source);
  releases.push(release);
  return release;
}

afterEach(() => {
  for (const release of releases.splice(0)) {
    release();
  }
});

describe('keepAudioContextRunning', () => {
  it('resumes a context that is already suspended when tracking starts', () => {
    const doc = new Target();
    const context = new FakeContext();
    context.state = 'suspended';
    track(context, { document: doc, window: new Target() });
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  it('never suspends a running context when the page goes hidden', () => {
    const doc = new Target();
    const context = new FakeContext();
    track(context, { document: doc, window: new Target() });

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));

    expect(context.resume).not.toHaveBeenCalled();
    expect(context.state).toBe('running');
  });

  it('resumes a suspended context when the page becomes visible again', () => {
    const doc = new Target();
    const context = new FakeContext();
    track(context, { document: doc, window: new Target() });

    context.state = 'suspended';
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.state).toBe('running');
  });

  it('resumes an interrupted context after pageshow and when it suspends itself', () => {
    const win = new Target();
    const context = new FakeContext();
    track(context, { document: new Target(), window: win });

    context.state = 'interrupted';
    win.dispatchEvent(new Event('pageshow'));
    expect(context.resume).toHaveBeenCalledTimes(1);

    context.state = 'suspended';
    context.dispatchEvent(new Event('statechange'));
    expect(context.resume).toHaveBeenCalledTimes(2);
  });

  it('survives a resume that rejects and stops tracking on release', async () => {
    const doc = new Target();
    const context = new FakeContext();
    context.resume = vi.fn(() => Promise.reject(new Error('blocked')));
    const release = track(context, { document: doc, window: new Target() });
    context.state = 'suspended';
    doc.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(trackedContextCount()).toBe(1);

    release();
    expect(trackedContextCount()).toBe(0);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(context.resume).toHaveBeenCalledTimes(1);
  });
});
