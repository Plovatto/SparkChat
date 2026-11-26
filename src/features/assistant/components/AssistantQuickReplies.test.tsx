import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantButton } from '../assistant-card';
import { AssistantCardView } from './AssistantCardView';
import { AssistantQuickReplies } from './AssistantQuickReplies';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (typeof options?.label === 'string' ? `✓ ${options.label}` : key),
  }),
}));

const buttons: AssistantButton[] = [
  { choice: 'yes', label: 'Aplicar' },
  { choice: 'no', label: 'Não' },
];

describe('AssistantQuickReplies', () => {
  it('reports the tapped button and locks the others', () => {
    const onSelect = vi.fn();
    render(<AssistantQuickReplies buttons={buttons} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(onSelect).toHaveBeenCalledWith(buttons[0]);
    expect(screen.getByRole('button', { name: 'Não' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows only the chosen label once resolved', () => {
    render(<AssistantQuickReplies buttons={buttons} resolvedChoice="yes" onSelect={vi.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('assistant-resolved').textContent).toBe('✓ Aplicar');
  });

  it('hides the buttons when the resolution arrives after tapping', () => {
    const { rerender } = render(<AssistantQuickReplies buttons={buttons} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Não' }));

    rerender(<AssistantQuickReplies buttons={buttons} resolvedChoice="no" onSelect={vi.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('assistant-resolved').textContent).toBe('✓ Não');
  });
});

describe('AssistantCardView', () => {
  it('forwards the card id with the tapped button', () => {
    const onQuickReply = vi.fn();
    render(<AssistantCardView card={{ v: 1, kind: 'choices', buttons }} cardId="msg-1" onQuickReply={onQuickReply} />);

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(onQuickReply).toHaveBeenCalledWith('msg-1', buttons[0]);
  });

  it('renders nothing for cards without a body yet', () => {
    const { container } = render(<AssistantCardView card={{ v: 1, kind: 'capabilities' }} cardId="m" onQuickReply={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders list items', () => {
    render(
      <AssistantCardView
        card={{ v: 1, kind: 'list', title: 'Notas', items: [{ id: '1', text: 'Comprar pão', detail: 'hoje' }] }}
        cardId="m"
        onQuickReply={vi.fn()}
      />,
    );
    expect(screen.getByText('Comprar pão')).toBeTruthy();
    expect(screen.getByText('hoje')).toBeTruthy();
  });
});
