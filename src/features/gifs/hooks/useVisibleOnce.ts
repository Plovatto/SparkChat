import { useEffect, useState, type RefObject } from 'react';

export function useVisibleOnce<T extends Element>(ref: RefObject<T | null>, root: Element | null, rootMargin = '150px 0px'): boolean {
  const [isVisible, setIsVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (isVisible || !element || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { root, rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, root, rootMargin, isVisible]);

  return isVisible;
}
