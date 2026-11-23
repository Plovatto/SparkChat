import { useCallback, useEffect, useRef } from 'react';
import { needsBackgroundAnchor, startBackgroundAnchor, type BackgroundAnchor } from '../lib/background-anchor';

export function useBackgroundAnchor(active: boolean, start: () => BackgroundAnchor | null = defaultStart): () => void {
  const anchorRef = useRef<BackgroundAnchor | null>(null);
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    if (!active) {
      return;
    }
    const anchor = startRef.current();
    anchorRef.current = anchor;
    return () => {
      anchor?.stop();
      anchorRef.current = null;
    };
  }, [active]);

  return useCallback(() => anchorRef.current?.revive(), []);
}

function defaultStart(): BackgroundAnchor | null {
  return needsBackgroundAnchor() ? startBackgroundAnchor() : null;
}
