import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { buildTheme } from '@features/theme';
import type { ChatSettings } from '@features/theme/constants/chat-appearance';
import { ThemeContext, type ThemeContextValue } from '@features/theme/theme-context';
import { AssistantLookPreview } from './AssistantLookPreview';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => (options ? `${key}|${Object.values(options).join('|')}` : key),
  }),
}));

function wrap(children: ReactNode, settings: Partial<ChatSettings> = {}) {
  const value = {
    theme: buildTheme('dark', 'duskViolet').tokens,
    baseTheme: 'dark',
    colorTheme: 'duskViolet',
    chatSettings: { roomWallpapers: {}, globalWallpaper: 'gradient1', roomAppearance: {}, globalAppearance: null, ...settings },
  } as unknown as ThemeContextValue;
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

function surface(container: HTMLElement): HTMLElement {
  return container.querySelector('.sc-appearance-preview') as HTMLElement;
}

describe('AssistantLookPreview', () => {
  it('shows theme and wallpaper names for the chosen look', () => {
    render(wrap(<AssistantLookPreview look={{ baseTheme: 'light', colorTheme: 'standard', wallpaper: 'gradient2' }} />));
    expect(screen.getByText('chat.assistant.card.lookTheme|bases.light · colors.standard')).toBeTruthy();
    expect(screen.getByText('chat.assistant.card.lookWallpaper|wallpapers.gradient2')).toBeTruthy();
  });

  it('falls back to the current wallpaper when the look has none', () => {
    const { container } = render(wrap(<AssistantLookPreview look={{ colorTheme: 'standard' }} />));
    expect(surface(container).style.background).toContain('linear-gradient');
    expect(screen.queryByText(/lookWallpaper/)).toBeNull();
  });

  it('ignores unknown ids without breaking', () => {
    const { container } = render(wrap(<AssistantLookPreview look={{ baseTheme: 'nope', colorTheme: 'nope', wallpaper: 'nope' }} />));
    expect(surface(container)).toBeTruthy();
    expect(screen.queryByText(/lookTheme/)).toBeNull();
    expect(screen.queryByText(/lookWallpaper/)).toBeNull();
  });

  it('lists the appearance fields the look adjusts once each', () => {
    render(wrap(<AssistantLookPreview look={{ appearance: { overlayOpacity: 50, bubbleBlur: 10, ownBubbleOpacity: 80, ownBubbleColor: '#ffffff' } }} />));
    expect(
      screen.getByText('chat.assistant.card.lookAppearance|chat.appearance.dim, chat.appearance.bubbleBlur, chat.appearanceModal.sent'),
    ).toBeTruthy();
  });
});
