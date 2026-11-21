import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ptApp from '../../../locales/pt/app.json';

type Tree = { [key: string]: string | Tree };

function lookup(key: string): string {
  const value = key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), ptApp as Tree);
  return typeof value === 'string' ? value : key;
}

const media = { sheet: false };

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: lookup }),
}));

vi.mock('@hooks/useMediaQuery', () => ({
  useMediaQuery: () => media.sheet,
}));

vi.mock('../styles/message-actions.css', () => ({}));

const { MessageActionsRow } = await import('./MessageActionsRow');

afterEach(() => {
  media.sheet = false;
});

function toolbarLabels() {
  return Array.from(screen.getByRole('toolbar').querySelectorAll(':scope > button'), (button) => button.getAttribute('aria-label'));
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }));
  return screen.getByRole('menu');
}

function menuLabels() {
  return screen.getAllByRole('menuitem').map((item) => item.textContent);
}

describe('MessageActionsRow toolbar', () => {
  it('shows reply, react, forward and more in that order', () => {
    render(<MessageActionsRow isOwn={false} onReply={vi.fn()} onReact={vi.fn()} onForward={vi.fn()} onDelete={vi.fn()} />);

    expect(toolbarLabels()).toEqual(['Responder', 'Reagir', 'Encaminhar', 'Mais opções']);
  });

  it('lists copy, translate, select and delete in the more menu, delete included for other people', () => {
    render(
      <MessageActionsRow
        isOwn={false}
        canCopy
        canTranslate
        onReply={vi.fn()}
        onForward={vi.fn()}
        onCopy={vi.fn()}
        onTranslate={vi.fn()}
        onStartSelection={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    openMenu();

    expect(menuLabels()).toEqual(['Copiar texto', 'Traduzir', 'Selecionar', 'Apagar']);
  });

  it('runs actions without bubbling to the message', () => {
    const parentClick = vi.fn();
    const onDelete = vi.fn();
    const onStartSelection = vi.fn();
    render(
      <div onClick={parentClick}>
        <MessageActionsRow isOwn onReply={vi.fn()} onForward={vi.fn()} onStartSelection={onStartSelection} onDelete={onDelete} />
      </div>,
    );

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Selecionar/ }));
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Apagar/ }));

    expect(onStartSelection).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('shows only the more button for a message deleted for everyone', () => {
    render(<MessageActionsRow isOwn onDelete={vi.fn()} onStartSelection={vi.fn()} />);

    expect(toolbarLabels()).toEqual(['Mais opções']);
    openMenu();
    expect(menuLabels()).toEqual(['Selecionar', 'Apagar']);
  });

  it('marks the react button expanded and shows the reaction popover', () => {
    render(<MessageActionsRow isOwn onReact={vi.fn()} isReactionOpen reactionPopover={<button type="button">❤️</button>} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Reagir' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: '❤️' })).toBeTruthy();
  });

  it('closes the reaction popover with Escape and returns focus to the react button', () => {
    const onReact = vi.fn();
    render(<MessageActionsRow isOwn onReact={onReact} isReactionOpen reactionPopover={<button type="button">❤️</button>} onDelete={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole('button', { name: '❤️' }), { key: 'Escape' });

    expect(onReact).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reagir' }));
  });

  it('closes the reaction popover when the more menu opens', () => {
    const onReact = vi.fn();
    render(<MessageActionsRow isOwn onReact={onReact} isReactionOpen reactionPopover={<div>barra</div>} onDelete={vi.fn()} />);

    openMenu();

    expect(onReact).toHaveBeenCalledTimes(1);
  });
});

describe('MessageActionsRow sheet', () => {
  it('shows the quick reactions header and every action, dismissing after an action', () => {
    media.sheet = true;
    const onDismiss = vi.fn();
    const onReply = vi.fn();
    render(
      <MessageActionsRow
        isOwn
        canCopy
        onReply={onReply}
        onForward={vi.fn()}
        onCopy={vi.fn()}
        onStartSelection={vi.fn()}
        onDelete={vi.fn()}
        sheetHeader={<div>reações rápidas</div>}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText('reações rápidas')).toBeTruthy();
    expect(menuLabels()).toEqual(['Responder', 'Encaminhar', 'Copiar texto', 'Selecionar', 'Apagar']);
    fireEvent.click(screen.getByRole('menuitem', { name: /Responder/ }));
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss after starting the selection so the message is not selected again', () => {
    media.sheet = true;
    const onDismiss = vi.fn();
    const onStartSelection = vi.fn();
    render(<MessageActionsRow isOwn onDelete={vi.fn()} onStartSelection={onStartSelection} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('menuitem', { name: /Selecionar/ }));

    expect(onStartSelection).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
