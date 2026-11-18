import { useEffect, useState, type RefObject } from 'react';

function supportsIntersectionObserver(): boolean {
  return typeof IntersectionObserver !== 'undefined';
}

export function useInViewport<T extends Element>(ref: RefObject<T | null>, rootMargin = '300px 0px'): boolean {
  const [isInViewport, setIsInViewport] = useState(() => !supportsIntersectionObserver());

  useEffect(() => {
    const element = ref.current;
    if (!element || !supportsIntersectionObserver()) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) {
          setIsInViewport(entry.isIntersecting);
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return isInViewport;
}
