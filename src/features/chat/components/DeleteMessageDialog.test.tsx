import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enApp from '../../../locales/en/app.json';
import ptApp from '../../../locales/pt/app.json';

type Tree = { [key: string]: string | Tree };

const language = vi.hoisted(() => ({ current: 'pt' }));
const sheet = vi.hoisted(() => ({ matches: false }));

function lookup(tree: Tree, key: string): string | undefined {
  const value = key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), tree);
  return typeof value === 'string' ? value : undefined;
}

function translate(key: string, options?: { count?: number }): string {
  const tree = (language.current === 'pt' ? ptApp : enApp) as Tree;
  const count = options?.count;
  const template = (count !== undefined ? lookup(tree, `${key}_${count === 1 ? 'one' : 'other'}`) : undefined) ?? lookup(tree, key) ?? key;
  return template.replace('{{count}}', String(count ?? ''));
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));

vi.mock('@hooks/useMediaQuery', () => ({
  useMediaQuery: () => sheet.matches,
}));

vi.mock('../styles/delete-messages.css', () => ({}));

const { DeleteMessageDialog } = await import('./DeleteMessageDialog');

interface RenderOptions {
  count?: number;
  canDeleteForEveryone?: boolean;
  isOpen?: boolean;
}

function renderDialog({ count = 1, canDeleteForEveryone = true, isOpen = true }: RenderOptions = {}) {
  const callbacks = { onDeleteForEveryone: vi.fn(), onDeleteForMe: vi.fn(), onClose: vi.fn() };
  const view = render(<DeleteMessageDialog isOpen={isOpen} count={count} canDeleteForEveryone={canDeleteForEveryone} {...callbacks} />);
  return { ...callbacks, ...view };
}

beforeEach(() => {
  language.current = 'pt';
  sheet.matches = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DeleteMessageDialog', () => {
  it('offers both options for your own message with the reference copy', () => {
    renderDialog();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Apagar mensagem?' })).toBeTruthy();
    expect(screen.getByText('Esta ação não pode ser desfeita.')).toBeTruthy();
    expect(
      screen.getByText('Apagar para todos remove a mensagem da conversa de todo mundo. Apagar só para mim remove apenas da sua tela.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apagar para todos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apagar só para mim' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy();
  });

  it('only offers deleting for yourself when the selection has other people messages', () => {
    renderDialog({ count: 3, canDeleteForEveryone: false });
    expect(screen.getByRole('heading', { name: 'Apagar mensagens?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apagar para todos' })).toBeNull();
    expect(screen.getByText(/remove as 3 mensagens apenas da sua tela/)).toBeTruthy();
  });

  it('runs the chosen action and closes', () => {
    const forEveryone = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar para todos' }));
    expect(forEveryone.onDeleteForEveryone).toHaveBeenCalledTimes(1);
    expect(forEveryone.onDeleteForMe).not.toHaveBeenCalled();
    expect(forEveryone.onClose).toHaveBeenCalledTimes(1);
    forEveryone.unmount();

    const forMe = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar só para mim' }));
    expect(forMe.onDeleteForMe).toHaveBeenCalledTimes(1);
    expect(forMe.onDeleteForEveryone).not.toHaveBeenCalled();
    expect(forMe.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with cancel, the X button, Escape and a backdrop click without deleting', () => {
    const { onClose, onDeleteForMe, onDeleteForEveryone } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    const backdrop = screen.getByTestId('delete-dialog-backdrop');
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(onDeleteForMe).not.toHaveBeenCalled();
    expect(onDeleteForEveryone).not.toHaveBeenCalled();
  });

  it('focuses the safe choice and keeps focus inside the dialog', () => {
    renderDialog();
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const close = screen.getByRole('button', { name: 'Fechar' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(cancel);
  });

  it('becomes a bottom sheet with a drag handle on phones and closes when dragged down', () => {
    sheet.matches = true;
    const { onClose } = renderDialog();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.className).toContain('is-sheet');
    const handle = dialog.querySelector('.sc-delete-dialog__handle');
    expect(handle).not.toBeNull();

    const header = dialog.querySelector<HTMLElement>('.sc-delete-dialog__header');
    if (!header) {
      throw new Error('missing header');
    }
    header.setPointerCapture = () => undefined;
    fireEvent.pointerDown(header, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(header, { pointerId: 1, clientY: 140 });
    fireEvent.pointerUp(header, { pointerId: 1, clientY: 140 });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(header, { pointerId: 2, clientY: 100 });
    fireEvent.pointerMove(header, { pointerId: 2, clientY: 260 });
    fireEvent.pointerUp(header, { pointerId: 2, clientY: 260 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays centred as a card on wide screens', () => {
    renderDialog();
    expect(screen.getByRole('alertdialog').className).not.toContain('is-sheet');
    expect(document.querySelector('.sc-delete-dialog__handle')).toBeNull();
  });

  it('keeps its content while playing the exit animation', () => {
    vi.useFakeTimers();
    const { rerender, onDeleteForEveryone, onDeleteForMe, onClose } = renderDialog({ count: 2, canDeleteForEveryone: true });
    rerender(
      <DeleteMessageDialog
        isOpen={false}
        count={0}
        canDeleteForEveryone={false}
        onDeleteForEveryone={onDeleteForEveryone}
        onDeleteForMe={onDeleteForMe}
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.className).toContain('is-exiting');
    expect(screen.getByRole('heading', { name: 'Apagar mensagens?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apagar para todos' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('renders the English copy', () => {
    language.current = 'en';
    renderDialog({ canDeleteForEveryone: true });
    expect(screen.getByRole('heading', { name: 'Delete message?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete for everyone' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete for me' })).toBeTruthy();
  });
});
