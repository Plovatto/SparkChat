import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { openHelpTarget, useHelpOpener } from './help-targets';

describe('useHelpOpener', () => {
  it('registers while mounted and unregisters on unmount', () => {
    const opener = vi.fn();
    const { unmount } = renderHook(() => useHelpOpener('profile', opener));
    openHelpTarget('profile');
    expect(opener).toHaveBeenCalledTimes(1);
    unmount();
    openHelpTarget('profile');
    expect(opener).toHaveBeenCalledTimes(1);
  });

  it('unregisters when the opener becomes null', () => {
    const opener = vi.fn();
    const { rerender } = renderHook(({ current }: { current: (() => void) | null }) => useHelpOpener('new-group', current), {
      initialProps: { current: opener as (() => void) | null },
    });
    rerender({ current: null });
    openHelpTarget('new-group');
    expect(opener).not.toHaveBeenCalled();
  });
});
