import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

type InsideRef = RefObject<Element | null> | undefined;

export function useOutsidePointerDown(isActive: boolean, insideRefs: readonly InsideRef[], onOutside: () => void, capture = false): void {
  const latest = useRef({ insideRefs, onOutside });

  useLayoutEffect(() => {
    latest.current = { insideRefs, onOutside };
  });

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (latest.current.insideRefs.some((ref) => ref?.current?.contains(target))) {
        return;
      }
      latest.current.onOutside();
    };

    document.addEventListener('pointerdown', handlePointerDown, capture);
    return () => document.removeEventListener('pointerdown', handlePointerDown, capture);
  }, [isActive, capture]);
}
