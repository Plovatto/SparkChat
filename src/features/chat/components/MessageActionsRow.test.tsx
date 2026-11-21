import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageActionsRow } from './MessageActionsRow';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: { accentSoft: '#222', accentText: '#0ff', successSoft: '#030', successText: '#0f0', dangerSoft: '#300', dangerText: '#f00' } }),
}));

const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  writeText.mockClear();
});

function renderRow(copyText: string | null) {
  const parentClick = vi.fn();
  render(
    <div onClick={parentClick}>
      <MessageActionsRow isOwn onReply={vi.fn()} onDelete={vi.fn()} onForward={vi.fn()} copyText={copyText} />
    </div>,
  );
  return { parentClick };
}

describe('MessageActionsRow copy action', () => {
  it('copies the message text and confirms it without selecting the bubble', async () => {
    const { parentClick } = renderRow('oi, tudo bem?');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'chat.message.copy' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('oi, tudo bem?');
    expect(parentClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'chat.message.copied' })).toBeTruthy();
  });

  it('hides the copy action when there is no text to copy', () => {
    renderRow(null);
    expect(screen.queryByRole('button', { name: 'chat.message.copy' })).toBeNull();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['chat.message.reply', 'chat.message.forward', 'chat.message.delete']);
  });
});
