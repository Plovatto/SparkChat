import { Fragment, useEffect, useRef } from 'react';
import { REDUCED_MOTION_QUERY } from '@constants/media-queries';

interface ScrambleTextProps {
  text: string;
}

const GLYPHS = 'abcdeghknopqrsuvxyz0123456789';
const DURATION_MS = 1100;

function randomGlyph(): string {
  return GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
}

export function ScrambleText({ text }: ScrambleTextProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const words = text.split(' ');

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined' || window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      return;
    }

    const chars = Array.from(root.querySelectorAll<HTMLSpanElement>('[data-char]'));
    let frame = 0;

    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - start) / DURATION_MS, 1);
        const resolved = Math.floor(progress * chars.length);
        chars.forEach((char, index) => {
          if (index < resolved) {
            char.removeAttribute('data-scrambling');
          } else {
            char.setAttribute('data-scrambling', randomGlyph());
          }
        });
        if (progress < 1) {
          frame = requestAnimationFrame(tick);
        }
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(root);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      chars.forEach((char) => char.removeAttribute('data-scrambling'));
    };
  }, []);

  return (
    <>
      <span className="lp-sr-only">{text}</span>
      <span ref={rootRef} className="lp-scramble" aria-hidden="true">
        {words.map((word, wordIndex) => (
          <Fragment key={wordIndex}>
            <span className="lp-scramble__word">
              {Array.from(word).map((char, charIndex) => (
                <span key={charIndex} data-char="">
                  {char}
                </span>
              ))}
            </span>
            {wordIndex < words.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </span>
    </>
  );
}
