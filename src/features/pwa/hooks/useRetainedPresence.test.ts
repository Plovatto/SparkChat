import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOTION_DURATION_MS } from '@features/motion';
import { PWA_CARD_EXIT_MS, PWA_TOAST_EXIT_MS, resolveRetainedValue } from './useRetainedPresence';

const css = readFileSync(path.resolve(import.meta.dirname, '../styles/pwa.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('retained presence', () => {
  it('keeps the last content on screen while the exit runs and swaps to new content at once', () => {
    expect(resolveRetainedValue(null, 'install')).toBe('install');
    expect(resolveRetainedValue('notifications', 'install')).toBe('notifications');
    expect(resolveRetainedValue(null, null)).toBeNull();
  });

  it('unmounts the card only after its collapse transition finishes', () => {
    expect(PWA_CARD_EXIT_MS).toBe(MOTION_DURATION_MS.normal);
    const transition = block('.pwa-card-shell');
    expect(transition).toContain('grid-template-rows var(--sc-dur-normal)');
    expect(transition).toContain('opacity var(--sc-dur-fast)');
    expect(MOTION_DURATION_MS.fast).toBeLessThanOrEqual(PWA_CARD_EXIT_MS);
  });

  it('unmounts the toast only after its slide out finishes', () => {
    expect(PWA_TOAST_EXIT_MS).toBe(MOTION_DURATION_MS.fast);
    expect(block('.pwa-toast-shell.is-exiting')).toContain('var(--sc-dur-fast)');
  });

  it('ships a reduced motion fallback for every animated piece', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const selector of ['.pwa-toast-shell', '.pwa-push-icon', '.pwa-push-notice', '.pwa-card-shell', '.pwa-install-btn']) {
      expect(reduced).toContain(selector);
    }
  });
});
