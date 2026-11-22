import { useLayoutEffect, useRef, type RefObject } from 'react';
import { REDUCED_MOTION_QUERY } from '../constants/motion';

const FLIP_ATTRIBUTE = 'data-flip-key';
const FLIP_DURATION_MS = 420;
const FLIP_EASING = 'cubic-bezier(0.25, 1.12, 0.5, 1)';
const FLIP_SPRING =
  'linear(0, 0.025, 0.088, 0.174, 0.271, 0.372, 0.47, 0.562, 0.646, 0.72, 0.783, 0.837, 0.881, 0.917, 0.945, 0.967, 0.984, 0.996, 1.004, 1.01, 1.013, 1.015, 1.015, 1.015, 1.014, 1.012, 1.011, 1.01, 1)';

function measure(container: HTMLElement | null): Map<string, number> {
  const tops = new Map<string, number>();
  if (!container) {
    return tops;
  }
  const origin = container.getBoundingClientRect().top;
  container.querySelectorAll<HTMLElement>(`[${FLIP_ATTRIBUTE}]`).forEach((element) => {
    const key = element.getAttribute(FLIP_ATTRIBUTE);
    if (key !== null) {
      tops.set(key, element.getBoundingClientRect().top - origin);
    }
  });
  return tops;
}

function supportsLinearEasing(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timing-function', 'linear(0, 1)');
}

function findPromotedKey(previousKeys: readonly string[], keys: readonly string[]): string | null {
  const previousIndex = new Map(previousKeys.map((key, index) => [key, index]));
  let promoted: string | null = null;
  let bestJump = 0;
  keys.forEach((key, index) => {
    const before = previousIndex.get(key);
    if (before !== undefined && before - index > bestJump) {
      bestJump = before - index;
      promoted = key;
    }
  });
  return promoted;
}

function liftedBackground(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--sc-surface-elevated').trim();
}

function settleReplayedAnimations(container: HTMLElement, before: Map<string, number>, promotedKey: string | null): void {
  if (typeof CSSAnimation === 'undefined') {
    return;
  }
  container.querySelectorAll<HTMLElement>(`[${FLIP_ATTRIBUTE}]`).forEach((element) => {
    const key = element.getAttribute(FLIP_ATTRIBUTE);
    if (key === null || key === promotedKey || !before.has(key) || typeof element.getAnimations !== 'function') {
      return;
    }
    element.getAnimations({ subtree: true }).forEach((animation) => {
      if (!(animation instanceof CSSAnimation) || animation.effect?.getComputedTiming().iterations === Infinity) {
        return;
      }
      animation.finish();
    });
  });
}

export function useFlipReorder(containerRef: RefObject<HTMLElement | null>, keys: readonly string[], resetKey: unknown = null): void {
  const orderKey = keys.join('\u0000');
  const previousOrderRef = useRef(orderKey);
  const previousResetKeyRef = useRef(resetKey);
  const snapshotRef = useRef<Map<string, number> | null>(null);

  if (previousOrderRef.current !== orderKey && snapshotRef.current === null) {
    snapshotRef.current = measure(containerRef.current);
  }

  useLayoutEffect(() => {
    const isSameView = Object.is(previousResetKeyRef.current, resetKey);
    previousResetKeyRef.current = resetKey;
    if (previousOrderRef.current === orderKey) {
      return;
    }
    const previousKeys = previousOrderRef.current.split('\u0000');
    previousOrderRef.current = orderKey;
    const before = snapshotRef.current;
    snapshotRef.current = null;
    const container = containerRef.current;
    const promotedKey = findPromotedKey(previousKeys, keys);
    if (container && before) {
      settleReplayedAnimations(container, before, promotedKey);
    }
    if (!isSameView || !before || !container || typeof window.matchMedia !== 'function' || window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      return;
    }
    const origin = container.getBoundingClientRect().top;
    const easing = supportsLinearEasing() ? FLIP_SPRING : FLIP_EASING;

    container.querySelectorAll<HTMLElement>(`[${FLIP_ATTRIBUTE}]`).forEach((element) => {
      const key = element.getAttribute(FLIP_ATTRIBUTE);
      if (key === null || typeof element.animate !== 'function') {
        return;
      }
      const previousTop = before.get(key);
      if (previousTop === undefined) {
        return;
      }
      element.getAnimations?.().forEach((animation) => {
        if (animation.id === 'sc-flip') {
          animation.cancel();
        }
      });
      const delta = previousTop - (element.getBoundingClientRect().top - origin);
      if (Math.abs(delta) < 1) {
        return;
      }
      const isPromoted = key === promotedKey && delta > 0;
      const restingBackground = isPromoted ? getComputedStyle(element).backgroundColor : '';
      const lifted = isPromoted ? liftedBackground() || restingBackground : '';
      const keyframes: Keyframe[] = isPromoted
        ? [
            { transform: `translate3d(0, ${delta}px, 0) scale(1)`, backgroundColor: lifted },
            { transform: `translate3d(0, ${delta * 0.35}px, 0) scale(1.025)`, backgroundColor: lifted, offset: 0.45 },
            { transform: 'translate3d(0, 0, 0) scale(1)', backgroundColor: restingBackground },
          ]
        : [{ transform: `translate3d(0, ${delta}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }];
      if (isPromoted) {
        element.style.position = 'relative';
        element.style.zIndex = '1';
      }
      const animation = element.animate(keyframes, { duration: FLIP_DURATION_MS, easing: isPromoted ? FLIP_EASING : easing });
      animation.id = 'sc-flip';
      const restore = () => {
        if (isPromoted) {
          element.style.position = '';
          element.style.zIndex = '';
        }
      };
      animation.onfinish = restore;
      animation.oncancel = restore;
    });
  }, [orderKey, keys, containerRef, resetKey]);
}
