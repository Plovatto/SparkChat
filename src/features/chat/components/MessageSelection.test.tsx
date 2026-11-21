import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ptApp from '../../../locales/pt/app.json';

type Tree = { [key: string]: string | Tree };

function lookup(tree: Tree, key: string): string | undefined {
  const value = key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), tree);
  return typeof value === 'string' ? value : undefined;
}

const PT: Tree = ptApp;

function translate(key: string, options?: { count?: number }): string {
  const count = options?.count;
  const template = (count !== undefined ? lookup(PT, `${key}_${count === 1 ? 'one' : 'other'}`) : undefined) ?? lookup(PT, key) ?? key;
  return template.replace('{{count}}', String(count ?? ''));
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));

vi.mock('../styles/delete-messages.css', () => ({}));

const { ComposerSlot, SelectableMessageRow, SelectionBar } = await import('./MessageSelection');
const { useMessageSelection } = await import('../hooks/useMessageSelection');

interface Item {
  key: string;
  ids: string[];
  label: string;
  selectable?: boolean;
}

const ITEMS: Item[] = [
  { key: 'a', ids: ['a'], label: 'texto da Ana' },
  { key: 'group', ids: ['img-1', 'img-2'], label: 'duas fotos' },
  { key: 'call', ids: ['call'], label: 'chamada perdida' },
  { key: 'sending', ids: ['sending'], label: 'enviando', selectable: false },
];

function Harness({ items = ITEMS, onDelete = () => undefined }: { items?: Item[]; onDelete?: (ids: string[]) => void }) {
  const [present, setPresent] = useState(items.filter((item) => item.selectable !== false).flatMap((item) => item.ids));
  const [callBacks, setCallBacks] = useState(0);
  const selection = useMessageSelection({ presentIds: present, resetKey: 'room', escapeEnabled: true });
  return (
    <div>
      {items.map((item) => {
        const isSelectable = selection.isSelecting && item.selectable !== false;
        return (
          <SelectableMessageRow
            key={item.key}
            isOwn={false}
            isSelecting={selection.isSelecting}
            isSelectable={isSelectable}
            isChecked={isSelectable && item.ids.every((id) => selection.selectionIds?.has(id))}
            isExiting={false}
            onToggle={() => selection.toggleSelection(item.ids)}
          >
            <span>{item.label}</span>
            {item.key === 'call' && (
              <button type="button" onClick={() => setCallBacks((count) => count + 1)}>
                Ligar de volta
              </button>
            )}
          </SelectableMessageRow>
        );
      })}
      <button type="button" onClick={() => selection.startSelection(['a'])}>
        Selecionar
      </button>
      <button type="button" onClick={() => setPresent((current) => current.filter((id) => id !== 'a'))}>
        remover a
      </button>
      <output data-testid="callbacks">{callBacks}</output>
      <ComposerSlot
        isSelecting={selection.isSelecting}
        bar={<SelectionBar count={selection.selectedIds.length} onCancel={selection.clearSelection} onDelete={() => onDelete(selection.selectedIds)} />}
      >
        <textarea aria-label="mensagem" defaultValue="" />
      </ComposerSlot>
    </div>
  );
}

function row(label: string): HTMLElement {
  const element = screen.getByText(label).closest<HTMLElement>('.sc-message-row');
  if (!element) {
    throw new Error(`row ${label} not found`);
  }
  return element;
}

describe('message selection mode', () => {
  it('toggles rows by click and counts the selection', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    expect(screen.getByText('1 selecionada')).toBeTruthy();
    expect(row('texto da Ana').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(row('chamada perdida'));
    expect(screen.getByText('2 selecionadas')).toBeTruthy();
    fireEvent.click(row('texto da Ana'));
    expect(screen.getByText('1 selecionada')).toBeTruthy();
    expect(row('texto da Ana').getAttribute('aria-checked')).toBe('false');
  });

  it('selects every image of a group together', () => {
    const onDelete = vi.fn();
    render(<Harness onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    fireEvent.click(row('duas fotos'));
    expect(screen.getByText('3 selecionadas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Apagar/ }));
    expect(onDelete).toHaveBeenCalledWith(['a', 'img-1', 'img-2']);
  });

  it('works from the keyboard and leaves with Escape', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    const group = row('duas fotos');
    expect(group.getAttribute('role')).toBe('checkbox');
    expect(group.tabIndex).toBe(0);
    fireEvent.keyDown(group, { key: ' ' });
    expect(group.getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(group, { key: 'Enter' });
    expect(group.getAttribute('aria-checked')).toBe('false');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(row('duas fotos').getAttribute('role')).toBeNull();
  });

  it('makes the row contents inert so buttons inside cannot be used while selecting', () => {
    render(<Harness />);
    const isInert = () => row('chamada perdida').querySelector('[data-testid="message-row-content"]')?.hasAttribute('inert');
    expect(isInert()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    expect(isInert()).toBe(true);
  });

  it('does not offer messages that are still sending', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    fireEvent.click(row('enviando'));
    expect(row('enviando').getAttribute('role')).toBeNull();
    expect(screen.getByText('1 selecionada')).toBeTruthy();
  });

  it('only counts messages that are still in the conversation', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    fireEvent.click(row('chamada perdida'));
    expect(screen.getByText('2 selecionadas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'remover a' }));
    expect(screen.getByText('1 selecionada')).toBeTruthy();
  });

  it('keeps the draft in the composer while the selection bar is shown', () => {
    render(<Harness />);
    const composer = screen.getByLabelText<HTMLTextAreaElement>('mensagem');
    fireEvent.change(composer, { target: { value: 'rascunho importante' } });
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    expect(screen.getByRole('toolbar')).toBeTruthy();
    expect(screen.getByTestId('composer-slot').style.display).toBe('none');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar seleção' }));
    expect(screen.getByLabelText<HTMLTextAreaElement>('mensagem').value).toBe('rascunho importante');
    expect(screen.getByTestId('callbacks').textContent).toBe('0');
  });
});
