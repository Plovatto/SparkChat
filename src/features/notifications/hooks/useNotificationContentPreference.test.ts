import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_NOTIFICATION_SHOW_CONTENT_STORAGE_KEY,
  NOTIFICATION_HIDE_CONTENT_STORAGE_KEY,
  readIsNotificationContentHidden,
} from './useNotificationContentPreference';

function stubStorage(initial: Record<string, string>) {
  const values = { ...initial };
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
    removeItem: (key: string) => {
      delete values[key];
    },
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readIsNotificationContentHidden', () => {
  it('shows content by default for people who never touched the setting', () => {
    stubStorage({});
    expect(readIsNotificationContentHidden()).toBe(false);
  });

  it('hides content only after an explicit choice to hide', () => {
    stubStorage({ [NOTIFICATION_HIDE_CONTENT_STORAGE_KEY]: 'true' });
    expect(readIsNotificationContentHidden()).toBe(true);
  });

  it('keeps showing content for people who had opted in under the old key and drops that key', () => {
    const values = stubStorage({ [LEGACY_NOTIFICATION_SHOW_CONTENT_STORAGE_KEY]: 'true' });
    expect(readIsNotificationContentHidden()).toBe(false);
    expect(values[LEGACY_NOTIFICATION_SHOW_CONTENT_STORAGE_KEY]).toBeUndefined();
  });

  it('lets a new explicit hide win over a leftover old key', () => {
    stubStorage({ [LEGACY_NOTIFICATION_SHOW_CONTENT_STORAGE_KEY]: 'true', [NOTIFICATION_HIDE_CONTENT_STORAGE_KEY]: 'true' });
    expect(readIsNotificationContentHidden()).toBe(true);
  });

  it('stays hidden when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readIsNotificationContentHidden()).toBe(true);
  });
});
