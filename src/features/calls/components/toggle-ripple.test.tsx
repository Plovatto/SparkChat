import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { useToggleRipple } from './call-hooks';
import { CallPip } from './CallPip';
import { TorchButton } from './TorchButton';
import type { TorchControl } from './use-torch';

describe('useToggleRipple', () => {
  it('stays quiet when a control mounts already pressed', () => {
    const { result } = renderHook(() => useToggleRipple(true));
    expect(result.current[0]).toBeUndefined();
  });

  it('stays quiet when the call turns a toggle on by itself, as when the camera starts with the call', () => {
    const { result, rerender } = renderHook(({ pressed }) => useToggleRipple(pressed), { initialProps: { pressed: false } });
    rerender({ pressed: true });
    expect(result.current[0]).toBeUndefined();
  });

  it('ripples when the user toggle turns the control on, even when the change lands later', () => {
    const { result, rerender } = renderHook(({ pressed }) => useToggleRipple(pressed), { initialProps: { pressed: false } });
    act(() => result.current[1]());
    expect(result.current[0]).toBeUndefined();
    rerender({ pressed: true });
    expect(result.current[0]).toBe('true');
    act(() => result.current[1]());
    rerender({ pressed: false });
    expect(result.current[0]).toBeUndefined();
    rerender({ pressed: true });
    expect(result.current[0]).toBeUndefined();
  });
});

describe('useToggleRipple arm expiry', () => {
  it('forgets a click that changed nothing, so a later change made by the call stays quiet', () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(({ pressed }) => useToggleRipple(pressed), { initialProps: { pressed: false } });
      act(() => result.current[1]());
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      rerender({ pressed: true });
      expect(result.current[0]).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
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
    expect(button().hasAttribute('data-ripple')).toBe(false);
    view.rerender(pip(false));
    fireEvent.click(screen.getByRole('button', { pressed: false }));
    view.rerender(pip(true));
    expect(button().getAttribute('data-ripple')).toBe('true');
  });

  it('ripples the torch only when the user switches it on', () => {
    const torch = (on: boolean) => ({ supported: true, on, toggle: vi.fn() }) as unknown as TorchControl;
    const view = render(<TorchButton torch={torch(true)} />);
    expect(screen.getByRole('button', { pressed: true }).hasAttribute('data-ripple')).toBe(false);
    view.rerender(<TorchButton torch={torch(false)} />);
    fireEvent.click(screen.getByRole('button', { pressed: false }));
    view.rerender(<TorchButton torch={torch(true)} />);
    expect(screen.getByRole('button', { pressed: true }).getAttribute('data-ripple')).toBe('true');
  });

  it('keys the ripple animation on the data-ripple attribute, not on aria-pressed alone', () => {
    const css = readFileSync('src/features/calls/styles/calls.css', 'utf8');
    expect(css).not.toMatch(/\.sc-call-round\[aria-pressed='true'\]::before/);
    expect(css).toMatch(/\.sc-call-round\[aria-pressed='true'\]\[data-ripple\]::before\s*\{\s*animation: scCallToggleRipple/);
  });
});
