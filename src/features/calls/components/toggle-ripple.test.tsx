import { render, renderHook, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { useToggleRipple } from './call-hooks';
import { CallPip } from './CallPip';

describe('useToggleRipple', () => {
  it('stays quiet when a control mounts already pressed', () => {
    const { result } = renderHook(() => useToggleRipple(true));
    expect(result.current).toBeUndefined();
  });

  it('ripples only when the pressed state turns on after mount', () => {
    const { result, rerender } = renderHook(({ pressed }) => useToggleRipple(pressed), { initialProps: { pressed: false } });
    expect(result.current).toBeUndefined();
    rerender({ pressed: true });
    expect(result.current).toBe('true');
    rerender({ pressed: false });
    expect(result.current).toBeUndefined();
    rerender({ pressed: true });
    expect(result.current).toBe('true');
  });
});

describe('toggle ripple on call controls', () => {
  function pip(muted: boolean) {
    return <CallPip target={window} peerName="Ada" avatar={undefined} stream={null} speaking={false} muted={muted} remoteMuted={false} onToggleMute={vi.fn()} onHangup={vi.fn()} onClose={vi.fn()} />;
  }

  it('does not ripple a pressed toggle when the call view opens and ripples on a real toggle', () => {
    const view = render(pip(true));
    const button = () => screen.getByRole('button', { pressed: true });
    expect(button().hasAttribute('data-ripple')).toBe(false);
    view.rerender(pip(false));
    view.rerender(pip(true));
    expect(button().getAttribute('data-ripple')).toBe('true');
  });

  it('keys the ripple animation on the data-ripple attribute, not on aria-pressed alone', () => {
    const css = readFileSync('src/features/calls/styles/calls.css', 'utf8');
    expect(css).not.toMatch(/\.sc-call-round\[aria-pressed='true'\]::before/);
    expect(css).toMatch(/\.sc-call-round\[aria-pressed='true'\]\[data-ripple\]::before\s*\{\s*animation: scCallToggleRipple/);
  });
});
