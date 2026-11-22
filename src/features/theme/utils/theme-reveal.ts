import { flushSync } from 'react-dom';
import { REDUCED_MOTION_QUERY } from '@features/motion';

const REVEAL_CLASS = 'sc-theme-reveal';
const REVEAL_DURATION_MS = 560;
const REVEAL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

let activeReveals = 0;

export interface RevealOrigin {
  x: number;
  y: number;
}

export function originFromElement(element: Element | null): RevealOrigin | null {
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function revealThemeChange(origin: RevealOrigin | null, apply: () => void): void {
  const canReveal =
    typeof document.startViewTransition === 'function' &&
    typeof window.matchMedia === 'function' &&
    !window.matchMedia(REDUCED_MOTION_QUERY).matches;
  if (!canReveal) {
    apply();
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const root = document.documentElement;
  activeReveals += 1;
  root.classList.add(REVEAL_CLASS);
  const transition = document.startViewTransition(() => flushSync(apply));
  transition.updateCallbackDone?.catch(() => undefined);

  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_DURATION_MS, easing: REVEAL_EASING, pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => undefined);
  transition.finished
    .finally(() => {
      activeReveals -= 1;
      if (activeReveals === 0) {
        root.classList.remove(REVEAL_CLASS);
      }
    })
    .catch(() => undefined);
}
