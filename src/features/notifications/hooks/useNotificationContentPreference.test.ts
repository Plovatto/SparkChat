import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_CONTENT_STORAGE_KEY, readIsNotificationContentHidden } from './useNotificationContentPreference';

function stubStorage(values: Record<string, string>) {
  vi.stubGlobal('localStorage', { getItem: (key: string) => values[key] ?? null });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readIsNotificationContentHidden', () => {
  it('hides content by default', () => {
    stubStorage({});
    expect(readIsNotificationContentHidden()).toBe(true);
  });

  it('shows content only after an explicit opt-in', () => {
    stubStorage({ [NOTIFICATION_CONTENT_STORAGE_KEY]: 'true' });
    expect(readIsNotificationContentHidden()).toBe(false);
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
