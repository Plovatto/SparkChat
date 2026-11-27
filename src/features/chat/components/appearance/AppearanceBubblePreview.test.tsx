import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildTheme, DEFAULT_CHAT_APPEARANCE, resolveBubbleStyle, type ThemePalette } from '@features/theme';
import { ThemeContext, type ThemeContextValue } from '@features/theme/theme-context';
import { AppearanceBubblePreview } from './AppearanceBubblePreview';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

const contextTheme = buildTheme('dark', 'duskViolet').tokens;
const otherTheme = buildTheme('dark', 'standard').tokens;

function renderPreview(theme?: ThemePalette) {
  const value = { theme: contextTheme } as ThemeContextValue;
  return render(
    <ThemeContext value={value}>
      <AppearanceBubblePreview appearance={{ ...DEFAULT_CHAT_APPEARANCE, ownBubbleOpacity: 100 }} wallpaper={null} theme={theme} />
    </ThemeContext>,
  );
}

function outgoingBackground(): string {
  const bubble = screen.getByText('chat.appearanceModal.previewOutgoing').parentElement as HTMLElement;
  return bubble.style.backgroundColor;
}

function expectedOutgoing(theme: ThemePalette): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = resolveBubbleStyle(theme, { ...DEFAULT_CHAT_APPEARANCE, ownBubbleOpacity: 100 }, true).background;
  return probe.style.backgroundColor;
}

describe('AppearanceBubblePreview', () => {
  it('uses the context theme by default', () => {
    renderPreview();
    expect(outgoingBackground()).toBe(expectedOutgoing(contextTheme));
  });

  it('uses the passed theme instead of the context theme', () => {
    const first = renderPreview();
    const fromContext = outgoingBackground();
    first.unmount();
    renderPreview(otherTheme);
    expect(contextTheme.messageOwn).not.toBe(otherTheme.messageOwn);
    expect(outgoingBackground()).toBe(expectedOutgoing(otherTheme));
    expect(outgoingBackground()).not.toBe(fromContext);
  });

  it('blurs an image wallpaper even with zero dimming', () => {
    const value = { theme: contextTheme } as ThemeContextValue;
    const { container } = render(
      <ThemeContext value={value}>
        <AppearanceBubblePreview
          appearance={{ ...DEFAULT_CHAT_APPEARANCE, overlayOpacity: 0, overlayBlur: 9 }}
          wallpaper={{ id: 'unsplash1', background: 'url(x.jpg)', isImage: true }}
        />
      </ThemeContext>,
    );
    const overlay = container.querySelector<HTMLElement>('.sc-appearance-preview-overlay');
    expect(overlay?.style.backdropFilter).toBe('blur(9px)');
  });
});
