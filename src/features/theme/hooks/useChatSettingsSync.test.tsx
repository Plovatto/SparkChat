import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSettings } from '../constants/chat-appearance';
import { CHAT_SETTINGS_SYNC_DEBOUNCE_MS, useChatSettingsSync } from './useChatSettingsSync';

type Handler = (payload: unknown) => void;

const handlers = new Map<string, Set<Handler>>();
const emit = vi.fn();
const fakeSocket = {
  active: true,
  emit: (...args: unknown[]) => {
    emit(...args);
  },
  on: (event: string, handler: Handler) => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)?.add(handler);
  },
  off: (event: string, handler: Handler) => {
    handlers.get(event)?.delete(handler);
  },
};

function fire(event: string, payload: unknown) {
  act(() => {
    handlers.get(event)?.forEach((handler) => handler(payload));
  });
}

vi.mock('@lib/socket', () => ({
  useSocket: () => ({ socket: fakeSocket }),
  isSocketAuthenticated: () => true,
}));

const empty: ChatSettings = { roomWallpapers: {}, globalWallpaper: null, roomAppearance: {}, globalAppearance: null };
let setSettings: (settings: ChatSettings) => void = () => undefined;

vi.mock('../theme-context', async () => {
  const react = await import('react');
  return {
    useTheme: () => {
      const [chatSettings, set] = react.useState<ChatSettings>({ roomWallpapers: {}, globalWallpaper: null, roomAppearance: {}, globalAppearance: null });
      setSettings = set;
      const applyChatSettings = react.useCallback((next: ChatSettings) => set(next), []);
      return { chatSettings, applyChatSettings };
    },
  };
});

function setup() {
  const hook = renderHook(() => useChatSettingsSync());
  fire('user:registered', { user: { chatSettings: null } });
  emit.mockClear();
  return hook;
}

function edit(settings: ChatSettings) {
  act(() => setSettings(settings));
}

describe('useChatSettingsSync', () => {
  beforeEach(() => {
    handlers.clear();
    emit.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits a global wallpaper change once the debounce window elapses', () => {
    setup();
    edit({ ...empty, globalWallpaper: 'aurora' });
    expect(emit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(CHAT_SETTINGS_SYNC_DEBOUNCE_MS);
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('user:update-chat-settings', expect.objectContaining({ globalWallpaper: 'aurora' }));
  });

  it('emits when only a per-room wallpaper map changes', () => {
    setup();
    edit({ ...empty, roomWallpapers: { r1: 'sunset' } });
    act(() => {
      vi.advanceTimersByTime(CHAT_SETTINGS_SYNC_DEBOUNCE_MS);
    });
    expect(emit).toHaveBeenCalledWith('user:update-chat-settings', expect.objectContaining({ roomWallpapers: { r1: 'sunset' } }));
  });

  it('coalesces a burst of edits into one emit with the final value', () => {
    setup();
    for (let i = 1; i <= 20; i += 1) {
      edit({ ...empty, roomWallpapers: { r1: `w${i}` } });
      act(() => {
      vi.advanceTimersByTime(10);
    });
    }
    act(() => {
      vi.advanceTimersByTime(CHAT_SETTINGS_SYNC_DEBOUNCE_MS);
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('user:update-chat-settings', expect.objectContaining({ roomWallpapers: { r1: 'w20' } }));
  });

  it('applies a remote change without echoing it back', () => {
    setup();
    fire('user:chat-settings-updated', { chatSettings: { roomWallpapers: { r2: 'forest' }, globalWallpaper: 'ocean' } });
    act(() => {
      vi.advanceTimersByTime(CHAT_SETTINGS_SYNC_DEBOUNCE_MS * 3);
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('lets a remote change win over a pending local edit and does not re-emit the stale one', () => {
    setup();
    edit({ ...empty, globalWallpaper: 'aurora' });
    fire('user:chat-settings-updated', { chatSettings: { ...empty, globalWallpaper: 'ocean' } });
    act(() => {
      vi.advanceTimersByTime(CHAT_SETTINGS_SYNC_DEBOUNCE_MS * 3);
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits a local edit made after a remote change', () => {
    setup();
    fire('user:chat-settings-updated', { chatSettings: { ...empty, globalWallpaper: 'ocean' } });
    edit({ ...empty, globalWallpaper: 'aurora' });
    act(() => {
      vi.advanceTimersByTime(CHAT_SETTINGS_SYNC_DEBOUNCE_MS);
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('user:update-chat-settings', expect.objectContaining({ globalWallpaper: 'aurora' }));
  });

  it('flushes a pending edit on unmount', () => {
    const hook = setup();
    edit({ ...empty, globalWallpaper: 'aurora' });
    hook.unmount();
    expect(emit).toHaveBeenCalledWith('user:update-chat-settings', expect.objectContaining({ globalWallpaper: 'aurora' }));
  });
});
