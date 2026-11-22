import { useEffect, useRef } from 'react';

const MAX_TILT_DEG = 5;
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function resetCard(card: HTMLElement): void {
  delete card.dataset.hover;
  card.style.removeProperty('--lp-rx');
  card.style.removeProperty('--lp-ry');
}

export function useCardTilt<T extends HTMLElement>(cardSelector: string) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !window.matchMedia(FINE_POINTER_QUERY).matches || window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      return;
    }

    let frame = 0;
    let current: HTMLElement | null = null;

    const handleMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(cardSelector) : null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (current && current !== target) {
          resetCard(current);
        }
        current = target;
        if (!target) {
          return;
        }
        const rect = target.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const px = x / rect.width - 0.5;
        const py = y / rect.height - 0.5;
        target.style.transitionDelay = '0s';
        target.style.setProperty('--lp-mx', `${x}px`);
        target.style.setProperty('--lp-my', `${y}px`);
        target.style.setProperty('--lp-rx', `${(-py * MAX_TILT_DEG).toFixed(2)}deg`);
        target.style.setProperty('--lp-ry', `${(px * MAX_TILT_DEG).toFixed(2)}deg`);
        target.dataset.hover = 'true';
      });
    };

    const handleLeave = () => {
      cancelAnimationFrame(frame);
      if (current) {
        resetCard(current);
        current = null;
      }
    };

    root.addEventListener('pointermove', handleMove);
    root.addEventListener('pointerleave', handleLeave);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('pointermove', handleMove);
      root.removeEventListener('pointerleave', handleLeave);
    };
  }, [cardSelector]);

  return ref;
}
