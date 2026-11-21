import { useEffect, useState } from 'react';
import type { ViewportSize } from '../utils/popover-position';

export interface VisualViewportSize extends ViewportSize {
  bottomInset: number;
}

function readViewport(): VisualViewportSize {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 800, bottomInset: 0 };
  }
  const visual = window.visualViewport;
  const height = visual?.height ?? window.innerHeight;
  const offsetTop = visual?.offsetTop ?? 0;
  return {
    width: visual?.width ?? window.innerWidth,
    height,
    bottomInset: Math.max(0, Math.round(window.innerHeight - height - offsetTop)),
  };
}

export function useViewportSize(enabled: boolean): VisualViewportSize {
  const [size, setSize] = useState(readViewport);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const update = () => setSize(readViewport());
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return size;
}
