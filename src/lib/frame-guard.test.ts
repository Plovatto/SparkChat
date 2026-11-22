import { describe, expect, it } from 'vitest';
import { isFramed, refuseFraming } from './frame-guard';

describe('isFramed', () => {
  it('is false for a top-level window', () => {
    const win = {} as { top: unknown; self: unknown };
    win.top = win;
    win.self = win;

    expect(isFramed(win as unknown as Window)).toBe(false);
  });

  it('is true when another page hosts the app in a frame', () => {
    const win = { top: {}, self: {} };

    expect(isFramed(win as unknown as Window)).toBe(true);
  });

  it('is true when the hosting page cannot be inspected', () => {
    const win = {
      self: {},
      get top(): Window {
        throw new Error('blocked');
      },
    };

    expect(isFramed(win as unknown as Window)).toBe(true);
  });
});

describe('refuseFraming', () => {
  function framedWindow(top: unknown) {
    return {
      self: {},
      top,
      location: { href: 'https://app.test/app/' },
      document: { documentElement: { hidden: false } },
    };
  }

  it('leaves a top-level window rendering', () => {
    const win = { document: { documentElement: { hidden: false } } } as { top?: unknown; self?: unknown; document: { documentElement: { hidden: boolean } } };
    win.top = win;
    win.self = win;

    expect(refuseFraming(win as unknown as Window)).toBe(false);
    expect(win.document.documentElement.hidden).toBe(false);
  });

  it('hides the app and sends the hosting page to the app address', () => {
    const top = { location: { href: 'https://evil.test/' } };
    const win = framedWindow(top);

    expect(refuseFraming(win as unknown as Window)).toBe(true);
    expect(win.document.documentElement.hidden).toBe(true);
    expect(top.location.href).toBe('https://app.test/app/');
  });

  it('still refuses to render when the hosting page blocks navigation', () => {
    const top = {
      location: {
        set href(_value: string) {
          throw new Error('sandboxed');
        },
      },
    };
    const win = framedWindow(top);

    expect(refuseFraming(win as unknown as Window)).toBe(true);
    expect(win.document.documentElement.hidden).toBe(true);
  });
});
