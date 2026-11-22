import { afterEach, describe, expect, it, vi } from 'vitest';
import { originFromElement, revealThemeChange } from './theme-reveal';

type StartViewTransition = (callback: () => void) => { ready: Promise<void>; finished: Promise<void> };

function stubViewTransitions(start: StartViewTransition | undefined) {
  Object.defineProperty(document, 'startViewTransition', { configurable: true, writable: true, value: start });
}

describe('revealThemeChange', () => {
  afterEach(() => {
    stubViewTransitions(undefined);
    vi.restoreAllMocks();
    document.documentElement.classList.remove('sc-theme-reveal');
  });

  it('applies the theme right away when view transitions are not available', () => {
    const apply = vi.fn();
    revealThemeChange({ x: 10, y: 10 }, apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('sc-theme-reveal')).toBe(false);
  });

  it('applies the theme right away when the user prefers reduced motion', () => {
    const start = vi.fn<StartViewTransition>();
    stubViewTransitions(start);
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ matches: true, media: query }) as MediaQueryList);
    const apply = vi.fn();
    revealThemeChange(null, apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it('reveals the new theme from the origin inside a view transition and cleans up after it', async () => {
    let finish = () => undefined as void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const animate = vi.fn();
    Object.defineProperty(document.documentElement, 'animate', { configurable: true, value: animate });
    const start = vi.fn<StartViewTransition>((callback) => {
      callback();
      return { ready: Promise.resolve(), finished };
    });
    stubViewTransitions(start);
    const apply = vi.fn();

    revealThemeChange({ x: 40, y: 60 }, apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('sc-theme-reveal')).toBe(true);
    await Promise.resolve();
    expect(animate).toHaveBeenCalledWith(
      { clipPath: [expect.stringContaining('circle(0px at 40px 60px)'), expect.stringMatching(/^circle\(\d+(\.\d+)?px at 40px 60px\)$/)] },
      expect.objectContaining({ pseudoElement: '::view-transition-new(root)' }),
    );

    finish();
    await finished;
    await Promise.resolve();
    expect(document.documentElement.classList.contains('sc-theme-reveal')).toBe(false);
    delete (document.documentElement as { animate?: unknown }).animate;
  });

  it('keeps the colour transition disabled until the last of overlapping reveals finishes', async () => {
    const resolvers: (() => void)[] = [];
    Object.defineProperty(document.documentElement, 'animate', { configurable: true, value: vi.fn() });
    stubViewTransitions((callback) => {
      callback();
      const finished = new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
      return { ready: Promise.resolve(), finished };
    });

    revealThemeChange(null, vi.fn());
    revealThemeChange(null, vi.fn());
    resolvers[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.documentElement.classList.contains('sc-theme-reveal')).toBe(true);

    resolvers[1]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.documentElement.classList.contains('sc-theme-reveal')).toBe(false);
    delete (document.documentElement as { animate?: unknown }).animate;
  });

  it('uses the centre of the element as the origin', () => {
    const element = document.createElement('button');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 40, height: 20 } as DOMRect);
    expect(originFromElement(element)).toEqual({ x: 30, y: 30 });
    expect(originFromElement(null)).toBeNull();
  });
});
