import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './theme-context';
import type { ThemeContextValue } from './theme-context';

let api: ThemeContextValue;

function Probe() {
  api = useTheme();
  return null;
}

function mount() {
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

describe('ThemeProvider apply to all chats', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('applies a wallpaper to chats that had their own wallpaper', () => {
    mount();
    act(() => api.setRoomWallpaper('room-a', 'gradient3', false));
    act(() => api.setRoomWallpaper('room-b', 'gradient5', true));

    expect(api.getRoomWallpaper('room-a')?.id).toBe('gradient5');
    expect(api.hasRoomWallpaperOverride('room-a')).toBe(false);
  });

  it('applies appearance changes to chats with their own appearance, keeping their other settings', () => {
    mount();
    act(() => api.setRoomAppearance('room-a', { overlayOpacity: 70, bubbleBlur: 4 }, false));
    act(() => api.setRoomAppearance('room-b', { overlayOpacity: 10 }, true));

    expect(api.getRoomAppearance('room-a').overlayOpacity).toBe(10);
    expect(api.getRoomAppearance('room-a').bubbleBlur).toBe(4);
    expect(api.getRoomAppearance('room-c').overlayOpacity).toBe(10);
  });

  it('resets every chat when resetting for all', () => {
    mount();
    act(() => api.setRoomWallpaper('room-a', 'gradient3', false));
    act(() => api.setRoomAppearance('room-a', { overlayOpacity: 70 }, false));
    act(() => api.resetRoomWallpaper('room-b', true));
    act(() => api.resetRoomAppearance('room-b', true));

    expect(api.hasRoomWallpaperOverride('room-a')).toBe(false);
    expect(api.hasRoomAppearanceOverride('room-a')).toBe(false);
  });
});
