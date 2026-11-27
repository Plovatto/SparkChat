import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildTheme } from '@features/theme';
import { ThemeContext, type ThemeContextValue } from '@features/theme/theme-context';
import type { AssistantCard } from '@lib/assistant/assistant-card';
import { AssistantCardView } from './AssistantCardView';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderCard(card: AssistantCard) {
  const onQuickReply = vi.fn();
  const spies = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()];
  const [changeTheme, changeBaseTheme, changeColorTheme, setRoomAppearance, setRoomWallpaper] = spies;
  const value = {
    theme: buildTheme('dark', 'duskViolet').tokens,
    baseTheme: 'dark',
    colorTheme: 'duskViolet',
    chatSettings: { roomWallpapers: {}, globalWallpaper: null, roomAppearance: {}, globalAppearance: null },
    changeTheme,
    changeBaseTheme,
    changeColorTheme,
    setRoomAppearance,
    setRoomWallpaper,
  } as unknown as ThemeContextValue;
  render(
    <ThemeContext value={value}>
      <AssistantCardView card={card} cardId="m1" onQuickReply={onQuickReply} />
    </ThemeContext>,
  );
  return { onQuickReply, spies };
}

describe('AssistantLookCard', () => {
  it('renders a suggestion with preview and buttons, replying through the callback only', () => {
    const { onQuickReply, spies } = renderCard({
      v: 1,
      kind: 'look-suggestion',
      look: { colorTheme: 'standard' },
      buttons: [{ choice: 'yes', label: 'Apply' }],
    });
    expect(screen.getByText('chat.assistant.card.lookSuggestion')).toBeTruthy();
    const cards = document.querySelectorAll('.sc-assistant-card');
    expect(cards.length).toBe(1);
    expect(cards[0]?.querySelector('.sc-assistant-look-title')).toBeTruthy();
    expect(cards[0]?.querySelector('.sc-assistant-look-preview')).toBeTruthy();
    expect(cards[0]?.querySelector('.sc-assistant-look-actions button')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onQuickReply).toHaveBeenCalledWith('m1', { choice: 'yes', label: 'Apply' });
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('rendering an old applied card changes nothing on the client', () => {
    const { spies } = renderCard({
      v: 1,
      kind: 'look-applied',
      look: { baseTheme: 'light', colorTheme: 'standard', wallpaper: 'gradient1', appearance: { overlayOpacity: 10 } },
      previous: {},
      buttons: [{ choice: 'undo', label: 'Undo' }],
    });
    expect(screen.getByText('chat.assistant.card.lookApplied')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});
