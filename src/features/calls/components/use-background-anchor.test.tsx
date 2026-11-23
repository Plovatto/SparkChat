import { renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BackgroundAnchor } from '../lib/background-anchor';
import { useBackgroundAnchor } from './use-background-anchor';

function fakeStart() {
  const anchors: Array<BackgroundAnchor & { stopped: boolean; revived: number }> = [];
  const start = vi.fn(() => {
    const anchor = {
      stopped: false,
      revived: 0,
      revive: () => {
        anchor.revived += 1;
      },
      stop: () => {
        anchor.stopped = true;
      },
    };
    anchors.push(anchor);
    return anchor;
  });
  return { start, anchors };
}

describe('useBackgroundAnchor', () => {
  it('starts only while the call is live and stops when it ends', () => {
    const { start, anchors } = fakeStart();
    const { rerender, result } = renderHook(({ active }) => useBackgroundAnchor(active, start), { initialProps: { active: false } });
    expect(start).not.toHaveBeenCalled();

    rerender({ active: true });
    expect(anchors).toHaveLength(1);
    result.current();
    expect(anchors[0]?.revived).toBe(1);

    rerender({ active: true });
    expect(anchors).toHaveLength(1);

    rerender({ active: false });
    expect(anchors[0]?.stopped).toBe(true);
    result.current();
    expect(anchors[0]?.revived).toBe(1);
  });

  it('leaves exactly one running anchor under StrictMode and none after unmount', () => {
    const { start, anchors } = fakeStart();
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { unmount } = renderHook(() => useBackgroundAnchor(true, start), { wrapper });
    expect(anchors.filter((anchor) => !anchor.stopped)).toHaveLength(1);
    unmount();
    expect(anchors.every((anchor) => anchor.stopped)).toBe(true);
  });

  it('copes with platforms that need no anchor', () => {
    const { result, unmount } = renderHook(() => useBackgroundAnchor(true, () => null));
    expect(() => result.current()).not.toThrow();
    unmount();
  });
});
