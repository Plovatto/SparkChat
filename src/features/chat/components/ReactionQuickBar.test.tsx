import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QUICK_REACTIONS } from '../utils/reactions';
import { ReactionQuickBar } from './ReactionQuickBar';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${String(params.emoji)}` : key) }),
}));

function renderBar(ownEmoji: string | null = null) {
  const onReact = vi.fn();
  const onOpenPicker = vi.fn();
  const parentClick = vi.fn();
  render(
    <div onClick={parentClick}>
      <ReactionQuickBar isOwn={false} ownEmoji={ownEmoji} onReact={onReact} onOpenPicker={onOpenPicker} />
    </div>,
  );
  return { onReact, onOpenPicker, parentClick };
}

describe('ReactionQuickBar', () => {
  it('offers the six quick reactions and a button for the full picker', () => {
    renderBar();
    const buttons = screen.getAllByRole('button');

    expect(buttons).toHaveLength(7);
    expect(buttons.slice(0, 6).map((button) => button.textContent)).toEqual([...QUICK_REACTIONS]);
    expect(buttons[6]?.getAttribute('aria-label')).toBe('chat.reactions.more');
    expect(screen.getByRole('toolbar').getAttribute('aria-label')).toBe('chat.reactions.barLabel');
  });

  it('reacts with the chosen emoji without selecting the bubble', () => {
    const { onReact, parentClick } = renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'chat.reactions.reactWith:😂' }));

    expect(onReact).toHaveBeenCalledWith('😂');
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('marks the current reaction so choosing it again removes it', () => {
    renderBar('🙏');
    const active = screen.getByRole('button', { name: 'chat.reactions.removeReaction:🙏' });

    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('button').filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('shows a reaction picked from the full picker in place of the plus sign and opens the picker', () => {
    const { onOpenPicker } = renderBar('🦄');
    const more = screen.getByRole('button', { name: 'chat.reactions.more' });

    expect(more.textContent).toBe('🦄');
    expect(more.getAttribute('data-active')).toBe('true');
    fireEvent.click(more);
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
  });
});
