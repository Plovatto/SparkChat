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

vi.mock('../styles/message-actions.css', () => ({}));

const { MessageActionsRow } = await import('./MessageActionsRow');

const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  writeText.mockClear();
});

function toolbarLabels() {
  return Array.from(screen.getByRole('toolbar').querySelectorAll('button'), (button) => button.getAttribute('aria-label'));
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
  return screen.getByRole('menu');
}

function menuLabels() {
  return screen.getAllByRole('menuitem').map((item) => item.textContent);
}

describe('MessageActionsRow toolbar', () => {
  it('shows reply, react, forward and more in that order', () => {
    render(<MessageActionsRow isOwn={false} onReply={vi.fn()} onReact={vi.fn()} onForward={vi.fn()} onDelete={vi.fn()} />);

    expect(toolbarLabels()).toEqual(['Responder', 'Reagir', 'Encaminhar', 'Mais ações']);
  });

  it('runs reply, react and forward without bubbling to the message', () => {
    const parentClick = vi.fn();
    const onReply = vi.fn();
    const onReact = vi.fn();
    const onForward = vi.fn();
    render(
      <div onClick={parentClick}>
        <MessageActionsRow isOwn onReply={onReply} onReact={onReact} onForward={onForward} onDelete={vi.fn()} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reagir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Encaminhar' }));

    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onReact).toHaveBeenCalledTimes(1);
    expect(onForward).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('marks the react button as expanded while reactions are open and shows the popover', () => {
    render(<MessageActionsRow isOwn onReact={vi.fn()} isReactionOpen reactionPopover={<div>barra</div>} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Reagir' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('barra')).toBeTruthy();
  });

  it('hides the react button when the message cannot receive reactions', () => {
    render(<MessageActionsRow isOwn onReply={vi.fn()} onForward={vi.fn()} onDelete={vi.fn()} />);

    expect(toolbarLabels()).toEqual(['Responder', 'Encaminhar', 'Mais ações']);
  });
});

describe('MessageActionsRow more menu', () => {
  it('lists copy, select and delete and focuses the first item', () => {
    render(<MessageActionsRow isOwn={false} onReply={vi.fn()} onDelete={vi.fn()} onStartSelection={vi.fn()} copyText="oi" />);

    openMenu();

    expect(menuLabels()).toEqual(['Copiar', 'Selecionar', 'Apagar']);
    expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[0]);
    expect(screen.getByRole('button', { name: 'Mais ações' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('offers deleting on messages from other people too', () => {
    const onDelete = vi.fn();
    render(<MessageActionsRow isOwn={false} onDelete={onDelete} />);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Apagar/ }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('starts the selection mode', () => {
    const onStartSelection = vi.fn();
    render(<MessageActionsRow isOwn onDelete={vi.fn()} onStartSelection={onStartSelection} />);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Selecionar/ }));

    expect(onStartSelection).toHaveBeenCalledTimes(1);
  });

  it('shows only the delete action for a message deleted for everyone', () => {
    render(<MessageActionsRow isOwn onDelete={vi.fn()} />);

    expect(toolbarLabels()).toEqual(['Mais ações']);
    openMenu();
    expect(menuLabels()).toEqual(['Apagar']);
  });

  it('navigates with the arrow keys and closes with Escape returning focus', () => {
    render(<MessageActionsRow isOwn onDelete={vi.fn()} onStartSelection={vi.fn()} copyText="oi" />);

    const menu = openMenu();
    const items = screen.getAllByRole('menuitem');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(menu, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mais ações' }));
  });

  it('closes when clicking outside', () => {
    render(
      <>
        <button type="button">fora</button>
        <MessageActionsRow isOwn onDelete={vi.fn()} />
      </>,
    );

    openMenu();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'fora' }));

    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('MessageActionsRow copy action', () => {
  it('copies the message text, confirms it and closes the menu', async () => {
    vi.useFakeTimers();
    try {
      const parentClick = vi.fn();
      render(
        <div onClick={parentClick}>
          <MessageActionsRow isOwn onReply={vi.fn()} onDelete={vi.fn()} copyText="oi, tudo bem?" />
        </div>,
      );

      openMenu();
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: /Copiar/ }));
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledWith('oi, tudo bem?');
      expect(parentClick).not.toHaveBeenCalled();
      expect(screen.getByRole('menuitem', { name: /Copiado!/ })).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(screen.queryByRole('menu')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the copy action when there is no text to copy', () => {
    render(<MessageActionsRow isOwn onReply={vi.fn()} onDelete={vi.fn()} copyText={null} />);

    openMenu();
    expect(menuLabels()).toEqual(['Apagar']);
  });
});
