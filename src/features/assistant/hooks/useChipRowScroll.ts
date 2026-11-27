import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE_RATIO = 0.8;
const EDGE_TOLERANCE = 2;

export function useChipRowScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);

  const updateEdges = useCallback(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const maxScroll = element.scrollWidth - element.clientWidth;
    setCanScrollStart(element.scrollLeft > EDGE_TOLERANCE);
    setCanScrollEnd(maxScroll - element.scrollLeft > EDGE_TOLERANCE);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      const maxScroll = element.scrollWidth - element.clientWidth;
      if (maxScroll <= 0) {
        return;
      }
      const atStart = element.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = element.scrollLeft >= maxScroll && event.deltaY > 0;
      if (atStart || atEnd) {
        return;
      }
      event.preventDefault();
      element.scrollLeft = Math.min(maxScroll, Math.max(0, element.scrollLeft + event.deltaY));
      updateEdges();
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('scroll', updateEdges, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateEdges);
    observer?.observe(element);
    updateEdges();

    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('scroll', updateEdges);
      observer?.disconnect();
    };
  }, [updateEdges]);

  const scrollByPage = useCallback((direction: 1 | -1) => {
    const element = ref.current;
    if (!element) {
      return;
    }
    element.scrollBy({ left: direction * element.clientWidth * PAGE_RATIO, behavior: 'smooth' });
  }, []);

  return { ref, canScrollStart, canScrollEnd, scrollByPage };
}
