import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ptApp from '../../../locales/pt/app.json';

type Tree = { [key: string]: string | Tree };

function lookup(key: string): string {
  const value = key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), ptApp as Tree);
  return typeof value === 'string' ? value : key;
}

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: lookup }),
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: (_target, property) => String(property) }) }),
}));

const { MessageActionsRow } = await import('./MessageActionsRow');

const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  writeText.mockClear();
});

describe('MessageActionsRow', () => {
  it('offers deleting on messages from other people too', () => {
    const onDelete = vi.fn();
    render(<MessageActionsRow isOwn={false} onReply={vi.fn()} onForward={vi.fn()} onDelete={onDelete} onStartSelection={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Apagar/ }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Responder/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Encaminhar/ })).toBeTruthy();
  });

  it('starts the selection mode', () => {
    const onStartSelection = vi.fn();
    render(<MessageActionsRow isOwn onDelete={vi.fn()} onStartSelection={onStartSelection} />);

    fireEvent.click(screen.getByRole('button', { name: /Selecionar/ }));

    expect(onStartSelection).toHaveBeenCalledTimes(1);
  });

  it('shows only the delete action for a message deleted for everyone', () => {
    render(<MessageActionsRow isOwn onDelete={vi.fn()} />);

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Apagar']);
  });

  it('keeps every action in order when the message has text', () => {
    render(<MessageActionsRow isOwn={false} onReply={vi.fn()} onForward={vi.fn()} onDelete={vi.fn()} onStartSelection={vi.fn()} copyText="oi" />);

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Responder', 'Encaminhar', 'Copiar', 'Selecionar', 'Apagar']);
  });
});

describe('MessageActionsRow copy action', () => {
  function renderRow(copyText: string | null) {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <MessageActionsRow isOwn onReply={vi.fn()} onDelete={vi.fn()} onForward={vi.fn()} copyText={copyText} />
      </div>,
    );
    return { parentClick };
  }

  it('copies the message text and confirms it without selecting the bubble', async () => {
    const { parentClick } = renderRow('oi, tudo bem?');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copiar/ }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('oi, tudo bem?');
    expect(parentClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Copiado!/ })).toBeTruthy();
  });

  it('hides the copy action when there is no text to copy', () => {
    renderRow(null);
    expect(screen.queryByRole('button', { name: /Copiar/ })).toBeNull();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Responder', 'Encaminhar', 'Apagar']);
  });
});
