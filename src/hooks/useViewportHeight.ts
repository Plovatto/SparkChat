import { useEffect } from 'react';

function applyHeight(): void {
  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
}

export function useViewportHeight(): void {
  useEffect(() => {
    applyHeight();

    const viewport = window.visualViewport;
    const handleChange = () => {
      applyHeight();
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    viewport?.addEventListener('resize', handleChange);
    viewport?.addEventListener('scroll', handleChange);
    window.addEventListener('resize', handleChange);
    window.addEventListener('orientationchange', handleChange);

    return () => {
      viewport?.removeEventListener('resize', handleChange);
      viewport?.removeEventListener('scroll', handleChange);
      window.removeEventListener('resize', handleChange);
      window.removeEventListener('orientationchange', handleChange);
    };
  }, []);
}
