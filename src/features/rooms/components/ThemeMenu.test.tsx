import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@features/motion', () => ({ MOTION_DURATION_MS: { fast: 0 }, usePresence: (open: boolean) => ({ isPresent: open, isExiting: false }) }));
vi.mock('@features/theme', () => {
  const tokens = new Proxy({}, { get: (_target, property) => String(property) });
  return {
    buildTheme: () => ({ tokens }),
    COLOR_THEMES: { a: {}, b: {} },
    THEME_BASES: { x: {}, y: {}, z: {} },
    useTheme: () => ({ theme: tokens, baseTheme: 'x', colorTheme: 'a', changeBaseTheme: vi.fn(), changeColorTheme: vi.fn() }),
    useThemeNames: () => ({ base: (id: string) => id, color: (id: string) => id }),
  };
});

const { ThemeMenu } = await import('./ThemeMenu');

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

describe('ThemeMenu', () => {
  const original = window.innerWidth;

  beforeEach(() => setViewportWidth(1024));
  afterEach(() => setViewportWidth(original));

  it('stays fully inside a 320px viewport', () => {
    setViewportWidth(320);
    render(<ThemeMenu isOpen position={{ top: 60, right: 8 }} onClose={vi.fn()} />);
    const menu = document.querySelector<HTMLElement>('.sc-anim-menu-in');
    expect(menu).not.toBeNull();
    const width = parseFloat(menu?.style.width ?? '0');
    const right = parseFloat(menu?.style.right ?? '0');
    expect(width).toBeLessThanOrEqual(300);
    expect(right).toBeGreaterThanOrEqual(10);
    expect(right + width).toBeLessThanOrEqual(320 - 10);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ThemeMenu isOpen position={{ top: 60, right: 8 }} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape that another handler already consumed', () => {
    const onClose = vi.fn();
    render(<ThemeMenu isOpen position={{ top: 60, right: 8 }} onClose={onClose} />);
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not listen for Escape while closed', () => {
    const onClose = vi.fn();
    render(<ThemeMenu isOpen={false} position={{ top: 60, right: 8 }} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
