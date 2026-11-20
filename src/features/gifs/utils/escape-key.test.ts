import { describe, expect, it, vi } from 'vitest';
import { consumeEscape } from './escape-key';

function keyEvent(key: string, defaultPrevented = false) {
  return { key, defaultPrevented, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

describe('consumeEscape', () => {
  it('closes the panel and stops the key from reaching other escape handlers', () => {
    const onEscape = vi.fn();
    const event = keyEvent('Escape');

    expect(consumeEscape(event, onEscape)).toBe(true);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('ignores other keys and escapes already handled elsewhere', () => {
    const onEscape = vi.fn();
    const other = keyEvent('Enter');
    const handled = keyEvent('Escape', true);

    expect(consumeEscape(other, onEscape)).toBe(false);
    expect(consumeEscape(handled, onEscape)).toBe(false);
    expect(onEscape).not.toHaveBeenCalled();
    expect(handled.stopPropagation).not.toHaveBeenCalled();
  });
});
