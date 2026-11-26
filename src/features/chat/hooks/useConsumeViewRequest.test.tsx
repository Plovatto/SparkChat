import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useConsumeViewRequest } from './useConsumeViewRequest';

describe('useConsumeViewRequest', () => {
  it('applies a request once and not again when the panel reopens', () => {
    const apply = vi.fn();
    const request = { view: 'appearance', nonce: 1 };
    const { rerender } = renderHook(({ open }) => useConsumeViewRequest(open, request, apply), { initialProps: { open: true } });
    expect(apply).toHaveBeenCalledTimes(1);
    rerender({ open: false });
    rerender({ open: true });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('applies a new request with a different nonce', () => {
    const apply = vi.fn();
    const { rerender } = renderHook(({ nonce }) => useConsumeViewRequest(true, { view: 'appearance', nonce }, apply), { initialProps: { nonce: 1 } });
    rerender({ nonce: 2 });
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('waits until the panel is open', () => {
    const apply = vi.fn();
    const { rerender } = renderHook(({ open }) => useConsumeViewRequest(open, { view: 'appearance', nonce: 1 }, apply), { initialProps: { open: false } });
    expect(apply).not.toHaveBeenCalled();
    rerender({ open: true });
    expect(apply).toHaveBeenCalledWith('appearance');
  });
});
