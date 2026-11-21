import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MessageReaction, RoomParticipant } from '@lib/socket';
import { ReactorsSheet } from './ReactorsSheet';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@features/profile-photos/components/Avatar', () => ({
  Avatar: () => <span data-testid="avatar" />,
}));

const participants = [
  { id: 'me', nickname: 'Eu', avatar: 1 },
  { id: 'ana', nickname: 'Ana', avatar: 2 },
  { id: 'bia', nickname: 'Bia', avatar: 3 },
] as RoomParticipant[];

const reactions: MessageReaction[] = [
  { userId: 'ana', emoji: '❤️', updatedAt: '1' },
  { userId: 'me', emoji: '😂', updatedAt: '2' },
  { userId: 'bia', emoji: '❤️', updatedAt: '3' },
];

function renderSheet(initialEmoji: string | null = '❤️') {
  const onClose = vi.fn();
  const onRemoveOwn = vi.fn();
  render(
    <ReactorsSheet
      isOpen
      initialEmoji={initialEmoji}
      reactions={reactions}
      participants={participants}
      currentUserId="me"
      onRemoveOwn={onRemoveOwn}
      onClose={onClose}
    />,
  );
  return { onClose, onRemoveOwn };
}

describe('ReactorsSheet', () => {
  it('opens on the chosen emoji and lists who reacted with it', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog');
    const rows = within(dialog).getAllByRole('listitem');

    expect(rows.map((row) => row.textContent)).toEqual(['Ana❤️', 'Bia❤️']);
    expect(within(dialog).getAllByRole('tab').map((tab) => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([
      ['chat.reactions.all 3', 'false'],
      ['❤️ 2', 'true'],
      ['😂 1', 'false'],
    ]);
  });

  it('switches between emojis and lets the own reaction be removed', () => {
    const { onClose, onRemoveOwn } = renderSheet();

    fireEvent.click(screen.getByRole('tab', { name: /chat.reactions.all/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'chat.reactions.removeReaction' }));
    expect(onRemoveOwn).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('moves between tabs with the arrow keys and labels the panel with the active tab', () => {
    renderSheet(null);
    const tabs = screen.getAllByRole('tab');
    tabs[0]?.focus();

    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getAllByRole('tab')[1]);
    expect(screen.getAllByRole('tab')[1]?.getAttribute('aria-selected')).toBe('true');
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(screen.getAllByRole('tab')[1]?.id);
    expect(screen.getAllByRole('tab').every((tab) => tab.getAttribute('aria-controls') === panel.id)).toBe(true);

    fireEvent.keyDown(screen.getAllByRole('tab')[1]!, { key: 'End' });
    expect(screen.getAllByRole('tab')[2]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getAllByRole('tab')[2]!, { key: 'ArrowRight' });
    expect(screen.getAllByRole('tab')[0]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });

  it('keeps focus inside while open and gives it back when closed', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const props = {
      initialEmoji: null,
      reactions,
      participants,
      currentUserId: 'me',
      onRemoveOwn: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(<ReactorsSheet isOpen {...props} />);
    const close = screen.getByRole('button', { name: 'chat.reactions.close' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'chat.reactions.removeReaction' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    rerender(<ReactorsSheet isOpen={false} {...props} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('closes from the close button and with Escape', () => {
    const { onClose } = renderSheet(null);

    fireEvent.click(screen.getByRole('button', { name: 'chat.reactions.close' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
