import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeSync } from './useThemeSync';

type Handler = (payload: unknown) => void;

const handlers = new Map<string, Set<Handler>>();
const emit = vi.fn();
const fakeSocket = {
  active: true,
  emit: (...args: unknown[]) => emit(...args),
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

const themeState = { current: { baseTheme: 'dark', colorTheme: 'duskViolet' } };

vi.mock('../theme-context', async () => {
  const { useState: useReactState } = await import('react');
  return {
    useTheme: () => {
      const [state, setState] = useReactState(themeState.current);
      themeState.current = state;
      return {
        ...state,
        changeTheme: (themeId: string) => {
          const [baseTheme = '', colorTheme = ''] = themeId.split('-');
          setState((s) => ({ ...s, baseTheme, colorTheme }));
        },
        changeBaseTheme: (baseTheme: string) => setState((s) => ({ ...s, baseTheme })),
        changeColorTheme: (colorTheme: string) => setState((s) => ({ ...s, colorTheme })),
      };
    },
  };
});

function setup() {
  const hook = renderHook(() => useThemeSync());
  fire('user:registered', { user: { theme: { baseTheme: 'dark', colorTheme: 'duskViolet' } } });
  emit.mockClear();
  return hook;
}

describe('useThemeSync remote updates', () => {
  beforeEach(() => {
    handlers.clear();
    emit.mockClear();
    themeState.current = { baseTheme: 'dark', colorTheme: 'duskViolet' };
  });

  it('applies the pushed theme without echoing it back', () => {
    setup();
    fire('user:theme-updated', { baseTheme: 'light', colorTheme: 'duskViolet' });
    expect(themeState.current.baseTheme).toBe('light');
    expect(emit).not.toHaveBeenCalled();
  });

  it('ignores unknown ids and keeps the current theme', () => {
    setup();
    fire('user:theme-updated', { baseTheme: 'nope', colorTheme: 'duskViolet' });
    fire('user:theme-updated', { baseTheme: 'light', colorTheme: 'nope' });
    expect(themeState.current).toEqual({ baseTheme: 'dark', colorTheme: 'duskViolet' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const { unmount } = setup();
    expect(handlers.get('user:theme-updated')?.size).toBe(1);
    unmount();
    expect(handlers.get('user:theme-updated')?.size).toBe(0);
  });
});
