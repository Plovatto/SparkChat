import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ptApp from '../../../locales/pt/app.json';

type Tree = { [key: string]: string | Tree };

const sheetMode = vi.hoisted(() => ({ current: false }));

function lookup(tree: Tree, key: string): string {
  const value = key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), tree);
  return typeof value === 'string' ? value : key;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => lookup(ptApp, key) }),
}));

vi.mock('@hooks/useMediaQuery', () => ({ useMediaQuery: () => sheetMode.current }));
vi.mock('../styles/message-actions.css', () => ({}));

const { MessageActionsRow } = await import('./MessageActionsRow');
const { renderRichText } = await import('../utils/rich-text');
const { senderNameColor } = await import('../utils/sender-color');

function actions(overrides: Partial<Parameters<typeof MessageActionsRow>[0]> = {}) {
  const props = {
    isOwn: true,
    canDelete: true,
    canCopy: true,
    canTranslate: true,
    onReply: vi.fn(),
    onDelete: vi.fn(),
    onForward: vi.fn(),
    onCopy: vi.fn(),
    onTranslate: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<MessageActionsRow {...props} />);
  return props;
}

describe('MessageActionsRow on large screens', () => {
  beforeEach(() => {
    sheetMode.current = false;
  });

  it('shows reply, forward and more, hiding react until reactions are wired', () => {
    actions();
    expect(screen.getByRole('toolbar')).toBeTruthy();
    expect(screen.getByRole('button', { name: ptApp.chat.message.reply })).toBeTruthy();
    expect(screen.getByRole('button', { name: ptApp.chat.message.forward })).toBeTruthy();
    expect(screen.queryByRole('button', { name: ptApp.chat.message.react })).toBeNull();
  });

  it('shows the react button when a handler exists', () => {
    const props = actions({ onReact: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: ptApp.chat.message.react }));
    expect(props.onReact).toHaveBeenCalledTimes(1);
  });

  it('opens the overflow menu with copy, translate and delete', () => {
    const props = actions();
    fireEvent.click(screen.getByRole('button', { name: ptApp.chat.message.more }));
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain(ptApp.chat.message.copyText);
    expect(menu.textContent).toContain(ptApp.chat.message.translate);
    fireEvent.click(screen.getByRole('menuitem', { name: ptApp.chat.message.deleteAction }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it('hides the overflow button when there is nothing extra to show', () => {
    actions({ canDelete: false, canCopy: false, canTranslate: false });
    expect(screen.queryByRole('button', { name: ptApp.chat.message.more })).toBeNull();
  });
});

describe('MessageActionsRow on phones', () => {
  beforeEach(() => {
    sheetMode.current = true;
  });

  afterEach(() => {
    sheetMode.current = false;
  });

  it('lists every action in a bottom sheet with delete last', () => {
    actions();
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual([
      ptApp.chat.message.reply,
      ptApp.chat.message.forward,
      ptApp.chat.message.copyText,
      ptApp.chat.message.translate,
      ptApp.chat.message.deleteAction,
    ]);
  });

  it('runs the action and closes the sheet', () => {
    const props = actions();
    fireEvent.click(screen.getByRole('menuitem', { name: ptApp.chat.message.copyText }));
    expect(props.onCopy).toHaveBeenCalledTimes(1);
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('omits delete when not allowed', () => {
    actions({ canDelete: false });
    expect(screen.queryByRole('menuitem', { name: ptApp.chat.message.deleteAction })).toBeNull();
  });
});

describe('renderRichText', () => {
  const participants = [{ id: 'u1', nickname: 'aana' }] as Parameters<typeof renderRichText>[1];

  it('turns links into safe anchors and highlights known mentions', () => {
    render(<p>{renderRichText('@aana olha https://pousada.test/suite. e @fulano', participants, '#123456')}</p>);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://pousada.test/suite');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('@aana').className).toBe('sc-mention');
    expect(screen.queryByText('@fulano')).toBeNull();
  });

  it('does not linkify other schemes', () => {
    render(<p>{renderRichText('javascript:alert(1)', participants, '#000')}</p>);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('senderNameColor', () => {
  it('is stable per sender and uses darker colors in light mode', () => {
    expect(senderNameColor('user-1')).toBe(senderNameColor('user-1'));
    expect(senderNameColor('user-1', 'light')).not.toBe(senderNameColor('user-1', 'dark'));
  });
});
