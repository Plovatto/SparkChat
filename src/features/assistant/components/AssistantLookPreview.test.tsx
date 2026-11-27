import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { buildTheme } from '@features/theme';
import type { ChatSettings } from '@features/theme/constants/chat-appearance';
import { ThemeContext, type ThemeContextValue } from '@features/theme/theme-context';
import type { AssistantLook } from '@lib/assistant/assistant-card';
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
    expect(screen.getByText('bases.light').closest('li')?.className).toBe('sc-assistant-look-tag');
    expect(screen.getByText('colors.standard').closest('li')?.className).toBe('sc-assistant-look-tag');
    expect(screen.getByText('wallpapers.gradient2').closest('li')?.className).toBe('sc-assistant-look-tag');
  });

  it('falls back to the current wallpaper when the look has none', () => {
    const { container } = render(wrap(<AssistantLookPreview look={{ colorTheme: 'standard' }} />));
    expect(surface(container).style.background).toContain('linear-gradient');
    expect(container.querySelectorAll('.sc-assistant-look-tag').length).toBe(1);
  });

  it('ignores unknown ids without breaking', () => {
    const { container } = render(wrap(<AssistantLookPreview look={{ baseTheme: 'nope', colorTheme: 'nope', wallpaper: 'nope' }} />));
    expect(surface(container)).toBeTruthy();
    expect(container.querySelector('.sc-assistant-look-tag')).toBeNull();
  });

  it('lists the appearance fields the look adjusts once each', () => {
    render(wrap(<AssistantLookPreview look={{ appearance: { overlayOpacity: 50, bubbleBlur: 10, ownBubbleOpacity: 80, ownBubbleColor: '#ffffff' } }} />));
    expect(
      screen.getByText('chat.assistant.card.lookAppearance|chat.appearance.dim, chat.appearance.bubbleBlur, chat.appearanceModal.sent'),
    ).toBeTruthy();
  });
});

describe('AssistantLookPreview clamping', () => {
  it('clamps out of range appearance values before rendering', () => {
    const { container } = render(wrap(<AssistantLookPreview look={{ colorTheme: 'standard', wallpaper: 'unsplash1', appearance: { overlayOpacity: 900 } }} />));
    const overlay = container.querySelector('.sc-appearance-preview-overlay') as HTMLElement;
    expect(overlay.style.backgroundColor).toBe('rgb(0, 0, 0)');
  });
});

describe('AssistantLookPreview untrusted values', () => {
  it('ignores non-numeric ranged values and invalid colors', () => {
    const look = { wallpaper: 'unsplash1', appearance: { overlayOpacity: '900', ownBubbleColor: 'red', otherBubbleColor: '#00ff00' } } as unknown as AssistantLook;
    const { container } = render(wrap(<AssistantLookPreview look={look} />));
    const overlay = container.querySelector('.sc-appearance-preview-overlay') as HTMLElement;
    expect(overlay.style.backgroundColor).toBe('rgba(0, 0, 0, 0.32)');
    const outgoing = screen.getByText('chat.appearanceModal.previewOutgoing').parentElement as HTMLElement;
    expect(outgoing.style.backgroundColor).not.toBe('red');
    const incoming = screen.getByText('chat.appearanceModal.previewIncoming').parentElement as HTMLElement;
    expect(incoming.style.backgroundColor).toContain('0, 255, 0');
  });
});
