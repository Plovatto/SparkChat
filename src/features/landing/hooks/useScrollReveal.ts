import { useLayoutEffect } from 'react';
import { REDUCED_MOTION_QUERY } from '@constants/media-queries';

const REVEAL_SELECTOR = [
  '.lp-section__intro',
  '.lp-bento__card',
  '.lp-more',
  '.lp-calls__tabs',
  '.lp-calls__visual',
  '.lp-calls__caption',
  '.lp-calls__facts',
  '.lp-studio__controls',
  '.lp-studio__preview',
  '.lp-step',
  '.lp-vault',
  '.lp-faq > *',
  '.lp-cta__inner',
].join(',');

const MAX_STAGGER_INDEX = 5;

function staggerIndex(element: Element): number {
  const parent = element.parentElement;
  if (!parent) {
    return 0;
  }
  const siblings = Array.from(parent.children).filter((child) => child.matches(REVEAL_SELECTOR));
  return Math.min(siblings.indexOf(element), MAX_STAGGER_INDEX);
}

export function useScrollReveal(): void {
  useLayoutEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      return;
    }

    const elements = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.reveal = 'shown';
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    );

    for (const element of elements) {
      if (element.getBoundingClientRect().top < window.innerHeight) {
        continue;
      }
      element.style.setProperty('--lp-reveal-index', String(staggerIndex(element)));
      element.dataset.reveal = 'hidden';
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      for (const element of elements) {
        delete element.dataset.reveal;
      }
    };
  }, []);
}
