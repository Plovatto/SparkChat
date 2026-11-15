import { useEffect, useRef } from 'react';

const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !window.matchMedia(FINE_POINTER_QUERY).matches || window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      return;
    }

    let frame = 0;

    const handleMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        element.style.setProperty('--lp-spot-x', `${event.clientX - rect.left}px`);
        element.style.setProperty('--lp-spot-y', `${event.clientY - rect.top}px`);
        element.dataset.spotlight = 'on';
      });
    };

    const handleLeave = () => {
      cancelAnimationFrame(frame);
      delete element.dataset.spotlight;
    };

    element.addEventListener('pointermove', handleMove);
    element.addEventListener('pointerleave', handleLeave);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('pointermove', handleMove);
      element.removeEventListener('pointerleave', handleLeave);
    };
  }, []);

  return ref;
}
