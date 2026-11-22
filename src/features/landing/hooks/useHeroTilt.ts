import { useEffect, useRef } from 'react';
import { FINE_POINTER_QUERY, REDUCED_MOTION_QUERY } from '@constants/media-queries';

const MAX_TILT_DEG = 3;

export function useHeroTilt<TArea extends HTMLElement, TTarget extends HTMLElement>() {
  const areaRef = useRef<TArea>(null);
  const targetRef = useRef<TTarget>(null);

  useEffect(() => {
    const area = areaRef.current;
    const target = targetRef.current;
    if (!area || !target || !window.matchMedia(FINE_POINTER_QUERY).matches || window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      return;
    }

    let frame = 0;

    const handleMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        const x = (event.clientX - (rect.left + rect.width / 2)) / window.innerWidth;
        const y = (event.clientY - (rect.top + rect.height / 2)) / window.innerHeight;
        target.style.transform = `perspective(1400px) rotateY(${(x * MAX_TILT_DEG * 2).toFixed(2)}deg) rotateX(${(-y * MAX_TILT_DEG * 2).toFixed(2)}deg)`;
      });
    };

    const handleLeave = () => {
      cancelAnimationFrame(frame);
      target.style.transform = '';
    };

    area.addEventListener('pointermove', handleMove);
    area.addEventListener('pointerleave', handleLeave);
    return () => {
      cancelAnimationFrame(frame);
      area.removeEventListener('pointermove', handleMove);
      area.removeEventListener('pointerleave', handleLeave);
    };
  }, []);

  return { areaRef, targetRef };
}
