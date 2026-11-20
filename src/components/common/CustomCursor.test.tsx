import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomCursor } from './CustomCursor';

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
}

describe('CustomCursor', () => {
  afterEach(() => {
    setFullscreenElement(null);
    document.documentElement.classList.remove('sc-cursor-active');
    vi.unstubAllGlobals();
  });

  it('restores the native cursor while something is fullscreen and hides it again on exit', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: fine)', addEventListener: () => undefined, removeEventListener: () => undefined }));
    setFullscreenElement(null);
    render(<CustomCursor />);
    expect(document.documentElement.classList.contains('sc-cursor-active')).toBe(true);
    act(() => {
      setFullscreenElement(document.body);
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(document.documentElement.classList.contains('sc-cursor-active')).toBe(false);
    act(() => {
      setFullscreenElement(null);
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(document.documentElement.classList.contains('sc-cursor-active')).toBe(true);
  });
});
