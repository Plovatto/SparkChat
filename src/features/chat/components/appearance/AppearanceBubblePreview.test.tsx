import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildTheme, DEFAULT_CHAT_APPEARANCE, type ThemePalette } from '@features/theme';
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

describe('AppearanceBubblePreview', () => {
  it('uses the context theme by default', () => {
    renderPreview();
    expect(outgoingBackground()).not.toBe('');
  });

  it('uses the passed theme instead of the context theme', () => {
    const first = renderPreview();
    const fromContext = outgoingBackground();
    first.unmount();
    renderPreview(otherTheme);
    expect(contextTheme.messageOwn).not.toBe(otherTheme.messageOwn);
    expect(outgoingBackground()).not.toBe(fromContext);
  });
});
