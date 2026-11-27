import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantCard } from '@lib/assistant/assistant-card';
import { AssistantCardView } from './AssistantCardView';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

const card: AssistantCard = {
  v: 1,
  kind: 'reminder-fired',
  reminderId: 'rem1',
  text: 'Call mom',
  buttons: [
    { choice: 'done', label: 'Done' },
    { choice: 'snooze10', label: 'Snooze 10 min' },
  ],
};

describe('reminder-fired card', () => {
  it('shows the text, a decorative bell and the quick replies', () => {
    const onQuickReply = vi.fn();
    render(<AssistantCardView card={card} cardId="m1" onQuickReply={onQuickReply} />);
    expect(screen.getByText('Call mom')).toBeTruthy();
    expect(document.querySelector('.sc-assistant-reminder-bell')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Snooze 10 min' }));
    expect(onQuickReply).toHaveBeenCalledWith('m1', card.buttons[1]);
  });

  it('shows short labels in one row while keeping the full label as the accessible name', () => {
    const onQuickReply = vi.fn();
    render(<AssistantCardView card={card} cardId="m1" onQuickReply={onQuickReply} />);
    const button = screen.getByRole('button', { name: 'Snooze 10 min' });
    expect(button.textContent).toBe('chat.assistant.card.snooze10Short');
  });

  it('falls back to a friendly title when the reminder text is empty', () => {
    render(<AssistantCardView card={{ ...card, text: '' }} cardId="m1" onQuickReply={vi.fn()} />);
    expect(screen.getByText('chat.assistant.card.reminderFallback')).toBeTruthy();
  });
});
