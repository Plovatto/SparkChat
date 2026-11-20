import type { ResumeSource } from './page-resume';
import { onPageResume } from './page-resume';

export interface PlaybackElement {
  srcObject: MediaProvider | null;
  paused: boolean;
  ended?: boolean;
  play: () => Promise<void>;
  addEventListener: (type: 'pause', listener: () => void) => void;
  removeEventListener: (type: 'pause', listener: () => void) => void;
}

export interface PlaybackDeps {
  play: (element: PlaybackElement) => void;
  source?: ResumeSource | null;
}

function hasSource(element: PlaybackElement): boolean {
  return element.srcObject !== null;
}

export function keepElementsPlaying(elements: () => Array<PlaybackElement | null>, deps: PlaybackDeps): () => void {
  const watched = new Set<PlaybackElement>();
  const revive = (element: PlaybackElement) => {
    if (hasSource(element) && (element.paused || element.ended === true)) {
      deps.play(element);
    }
  };
  const onPause = (element: PlaybackElement) => () => revive(element);
  const handlers = new Map<PlaybackElement, () => void>();

  const sync = () => {
    for (const element of elements()) {
      if (element && !watched.has(element)) {
        const handler = onPause(element);
        handlers.set(element, handler);
        element.addEventListener('pause', handler);
        watched.add(element);
      }
    }
  };

  const resume = () => {
    sync();
    for (const element of watched) {
      revive(element);
    }
  };

  sync();
  const stop = deps.source === undefined ? onPageResume(resume) : onPageResume(resume, deps.source);
  return () => {
    stop();
    for (const [element, handler] of handlers) {
      element.removeEventListener('pause', handler);
    }
    handlers.clear();
    watched.clear();
  };
}
