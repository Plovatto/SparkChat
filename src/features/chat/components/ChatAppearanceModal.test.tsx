import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTheme } from '@features/theme/build-theme';
import { DEFAULT_CHAT_APPEARANCE } from '@features/theme/constants/chat-appearance';
import type * as ThemeModuleNamespace from '@features/theme';

type ThemeModule = typeof ThemeModuleNamespace;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));

vi.mock('../styles/chat-appearance-modal.css', () => ({}));

const themeState = {
  setRoomWallpaper: vi.fn(),
  resetRoomWallpaper: vi.fn(),
  setRoomAppearance: vi.fn(),
  resetRoomAppearance: vi.fn(),
  hasRoomWallpaperOverride: vi.fn(() => false),
  hasRoomAppearanceOverride: vi.fn(() => false),
  getRoomWallpaper: vi.fn(() => null),
  getRoomAppearance: vi.fn(() => ({ ...DEFAULT_CHAT_APPEARANCE })),
};

vi.mock('@features/theme', async (importOriginal) => {
  const actual = await importOriginal<ThemeModule>();
  return {
    ...actual,
    useTheme: () => ({ theme: buildTheme('dark', 'duskViolet').tokens, ...themeState }),
    useThemeNames: () => ({ color: (id: string) => id, base: (id: string) => id, wallpaper: (id: string) => `wallpaper:${id}` }),
  };
});

const { ChatAppearanceModal } = await import('./ChatAppearanceModal');

describe('ChatAppearanceModal', () => {
  beforeEach(() => {
    themeState.hasRoomWallpaperOverride.mockReturnValue(false);
    themeState.hasRoomAppearanceOverride.mockReturnValue(false);
  });

  it('renders the title and marks the default wallpaper as selected', () => {
    render(<ChatAppearanceModal isOpen roomId="room-1" onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'chat.appearance.title' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'wallpaper:default' }).getAttribute('aria-checked')).toBe('true');
  });

  it('sets the room wallpaper when a tile is picked', () => {
    render(<ChatAppearanceModal isOpen roomId="room-1" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'wallpaper:gradient3' }));

    expect(themeState.setRoomWallpaper).toHaveBeenCalledWith('room-1', 'gradient3', false);
  });

  it('promotes the room settings to every chat and clears the room override', () => {
    themeState.hasRoomWallpaperOverride.mockReturnValue(true);
    render(<ChatAppearanceModal isOpen roomId="room-1" onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('chat.appearance.applyAll'));

    expect(themeState.setRoomAppearance).toHaveBeenCalledWith('room-1', DEFAULT_CHAT_APPEARANCE, true);
    expect(themeState.resetRoomAppearance).toHaveBeenCalledWith('room-1', false);
    expect(themeState.setRoomWallpaper).toHaveBeenCalledWith('room-1', 'default', true);
    expect(themeState.resetRoomWallpaper).toHaveBeenCalledWith('room-1', false);
  });

  it('keeps apply-to-all disabled without room overrides and resets this chat on demand', () => {
    render(<ChatAppearanceModal isOpen roomId="room-1" onClose={vi.fn()} />);

    expect((screen.getByText('chat.appearance.applyAll').closest('button') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('chat.appearanceModal.resetAll'));

    expect(themeState.resetRoomAppearance).toHaveBeenCalledWith('room-1', false);
    expect(themeState.resetRoomWallpaper).toHaveBeenCalledWith('room-1', false);
  });

  it('updates the bubble opacity through the room appearance action and closes from the header', () => {
    const onClose = vi.fn();
    render(<ChatAppearanceModal isOpen roomId="room-1" onClose={onClose} />);

    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[2] as HTMLInputElement, { target: { value: '40' } });
    expect(themeState.setRoomAppearance).toHaveBeenCalledWith('room-1', { ownBubbleOpacity: 40 }, false);

    fireEvent.click(screen.getByLabelText('common.close'));
    expect(onClose).toHaveBeenCalled();
  });
});
