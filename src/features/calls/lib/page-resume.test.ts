import { describe, expect, it, vi } from 'vitest';
import { onPageResume, type ResumeSource } from './page-resume';

class Target extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
}

function source() {
  const doc = new Target();
  const win = new Target();
  const resumeSource = { document: doc, window: win } as unknown as ResumeSource;
  return { doc, win, resumeSource };
}

describe('onPageResume', () => {
  it('ignores the page going hidden and reports it coming back', () => {
    const { doc, resumeSource } = source();
    const handler = vi.fn();
    onPageResume(handler, resumeSource);

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(handler).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(handler).toHaveBeenCalledWith('visible');
  });

  it('reports pageshow, resume and focus', () => {
    const { doc, win, resumeSource } = source();
    const reasons: string[] = [];
    onPageResume((reason) => reasons.push(reason), resumeSource);

    win.dispatchEvent(new Event('pageshow'));
    doc.dispatchEvent(new Event('resume'));
    win.dispatchEvent(new Event('focus'));

    expect(reasons).toEqual(['pageshow', 'resume', 'focus']);
  });

  it('stops reporting once disposed and tolerates a missing browser', () => {
    const { win, resumeSource } = source();
    const handler = vi.fn();
    const stop = onPageResume(handler, resumeSource);
    stop();
    win.dispatchEvent(new Event('pageshow'));
    expect(handler).not.toHaveBeenCalled();
    const noop = onPageResume(handler, null);
    expect(noop).toBeTypeOf('function');
  });
});
