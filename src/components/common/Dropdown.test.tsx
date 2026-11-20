import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dropdown, type DropdownOption } from './Dropdown';

const OPTIONS: DropdownOption[] = [
  { value: '', label: 'Padrão' },
  { value: 'usb', label: 'Microfone USB' },
  { value: 'int', label: 'Microfone interno' },
  { value: 'head', label: 'Headset com um nome muito longo de dispositivo' },
];

function Harness({ onChange = () => undefined, options = OPTIONS }: { onChange?: (value: string) => void; options?: DropdownOption[] }) {
  const [value, setValue] = useState('');
  return (
    <>
      <span id="label">Microfone</span>
      <Dropdown
        value={value}
        options={options}
        labelledBy="label"
        emptyLabel="Nenhum microfone encontrado"
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
      <button type="button">outside</button>
    </>
  );
}

function trigger() {
  return screen.getByRole('button', { name: /Microfone/ });
}

describe('Dropdown', () => {
  it('exposes the popup state on the trigger', () => {
    render(<Harness />);
    expect(trigger()?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger()?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger());
    expect(trigger()?.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('listbox')).not.toBeNull();
    expect(screen.getByRole('option', { name: 'Padrão' })?.getAttribute('aria-selected')).toBe('true');
  });

  it('selects an option with the mouse and returns focus to the trigger', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'Microfone USB' }));
    expect(onChange).toHaveBeenCalledWith('usb');
    expect(document.activeElement).toBe(trigger());
    expect(trigger().textContent).toContain('Microfone USB');
  });

  it('navigates with the keyboard and commits with Enter', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    const list = screen.getByRole('listbox');
    expect(document.activeElement).toBe(list);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'End' });
    expect(list.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[3]?.id);
    fireEvent.keyDown(list, { key: 'Home' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('usb');
  });

  it('jumps with type-ahead', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'h' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('head');
  });

  it('closes on Escape without selecting and keeps the event from closing parents', () => {
    const onChange = vi.fn();
    const parent = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    document.addEventListener('keydown', parent);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(trigger()?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
    expect(onChange).not.toHaveBeenCalled();
    expect(parent).not.toHaveBeenCalled();
    document.removeEventListener('keydown', parent);
  });

  it('closes on an outside click', () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }));
    expect(trigger()?.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole('listbox')).toBeNull();
    vi.useRealTimers();
  });

  it('is disabled with the empty label when there are no options', () => {
    render(<Harness options={[]} />);
    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
    expect(trigger().textContent).toContain('Nenhum microfone encontrado');
  });

  it('shows the full name of long options as a tooltip', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    const option = screen.getByRole('option', { name: OPTIONS[3]?.label ?? '' });
    expect(option?.getAttribute('title')).toBe(OPTIONS[3]?.label);
  });
});
