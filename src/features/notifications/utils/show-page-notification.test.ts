import { describe, expect, it, vi } from 'vitest';
import { showPageNotification } from './show-page-notification';

describe('showPageNotification', () => {
  it('uses a page notification that focuses the window and opens the room on click', () => {
    const notification = { onclick: null as (() => void) | null, close: vi.fn() };
    const onClick = vi.fn();
    const focusWindow = vi.fn();
    showPageNotification('Ana', { body: 'oi', tag: 'r1' }, 'r1', onClick, {
      createNotification: () => notification as unknown as Notification,
      getRegistration: () => Promise.resolve(undefined),
      focusWindow,
    });
    notification.onclick!();
    expect(focusWindow).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalled();
    expect(notification.close).toHaveBeenCalled();
  });

  it('falls back to the service worker where page notifications throw, as on Android', async () => {
    const showNotification = vi.fn(() => Promise.resolve());
    showPageNotification('Ana', { body: 'oi', tag: 'r1' }, 'r1', vi.fn(), {
      createNotification: () => {
        throw new TypeError('Illegal constructor');
      },
      getRegistration: () => Promise.resolve({ showNotification }),
      focusWindow: vi.fn(),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(showNotification).toHaveBeenCalledWith('Ana', { body: 'oi', tag: 'r1', data: { kind: 'msg', roomId: 'r1' } });
  });
});
