import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptApp from '../../locales/pt/app.json';

type Tree = { [key: string]: string | Tree };

const sheet = vi.hoisted(() => ({ current: false }));

function lookup(tree: Tree, key: string): string {
  const value = key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), tree);
  return typeof value === 'string' ? value : key;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number>) =>
      Object.entries(options ?? {}).reduce((text, [name, value]) => text.replace(`{{${name}}}`, String(value)), lookup(ptApp, key)),
  }),
}));
vi.mock('@hooks/useMediaQuery', () => ({ useMediaQuery: () => sheet.current }));
vi.mock('./color-picker.css', () => ({}));

const { ColorPicker } = await import('./ColorPicker');

function setup(value = '#4a4fc9') {
  const onChange = vi.fn();
  render(<ColorPicker value={value} onChange={onChange} label="Cor enviadas" />);
  return onChange;
}

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Cor enviadas' }));
}

describe('ColorPicker', () => {
  beforeEach(() => {
    sheet.current = false;
  });

  it('starts closed and opens a labelled dialog from the swatch', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    open();
    expect(screen.getByRole('dialog', { name: 'Cor enviadas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cor enviadas' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText<HTMLInputElement>(ptApp.colorPicker.hex).value).toBe('#4a4fc9');
  });

  it('applies a valid hex typed by the user', () => {
    const onChange = setup();
    open();
    const input = screen.getByLabelText(ptApp.colorPicker.hex);
    fireEvent.change(input, { target: { value: '#ff8800' } });
    expect(onChange).toHaveBeenLastCalledWith('#ff8800');
  });

  it('expands short hex values and ignores partial typing', () => {
    const onChange = setup();
    open();
    const input = screen.getByLabelText(ptApp.colorPicker.hex);
    fireEvent.change(input, { target: { value: '#ff88' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '#f80' } });
    expect(onChange).toHaveBeenLastCalledWith('#ff8800');
  });

  it('restores the current color when the typed hex is invalid', () => {
    const onChange = setup();
    open();
    const input = screen.getByLabelText<HTMLInputElement>(ptApp.colorPicker.hex);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.blur(input);
    expect(input.value).toBe('#4a4fc9');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('picks a suggested color and marks it as selected', () => {
    const onChange = setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: '#3dd68c' }));
    expect(onChange).toHaveBeenCalledWith('#3dd68c');
    expect(screen.getByRole('button', { name: '#3dd68c' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('moves the brightness and saturation with the keyboard', () => {
    const onChange = setup('#ff0000');
    open();
    const area = screen.getByRole('slider', { name: ptApp.colorPicker.area });
    fireEvent.keyDown(area, { key: 'ArrowLeft', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith('#ff1919');
    fireEvent.keyDown(area, { key: 'ArrowDown', shiftKey: true });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('changes the hue from the hue slider', () => {
    const onChange = setup('#ff0000');
    open();
    fireEvent.change(screen.getByRole('slider', { name: ptApp.colorPicker.hue }), { target: { value: '120' } });
    expect(onChange).toHaveBeenLastCalledWith('#00ff00');
  });

  it('follows color changes coming from the outside', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ColorPicker value="#4a4fc9" onChange={onChange} label="Cor enviadas" />);
    open();
    rerender(<ColorPicker value="#112233" onChange={onChange} label="Cor enviadas" />);
    expect(screen.getByLabelText<HTMLInputElement>(ptApp.colorPicker.hex).value).toBe('#112233');
  });

  it('closes with Escape and returns focus to the swatch', () => {
    setup();
    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Cor enviadas' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('renders as a bottom sheet with a backdrop on phones', () => {
    sheet.current = true;
    setup();
    open();
    expect(document.querySelector('.sc-cp-panel--sheet')).not.toBeNull();
    expect(document.querySelector('.sc-cp-backdrop')).not.toBeNull();
    fireEvent.click(document.querySelector('.sc-cp-backdrop') as Element);
    expect(screen.getByRole('button', { name: 'Cor enviadas' }).getAttribute('aria-expanded')).toBe('false');
  });
});
