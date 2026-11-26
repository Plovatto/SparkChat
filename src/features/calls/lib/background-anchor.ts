import { browserSource, onPageResume, type ResumeSource } from './page-resume';

export const ANCHOR_SAMPLE_RATE = 8000;
export const ANCHOR_SECONDS = 8;
export const ANCHOR_TONE_HZ = 30;
export const ANCHOR_AMPLITUDE = 100;
export const ANCHOR_RETRY_MS = [1000, 3000, 10000] as const;
export const ANCHOR_RESUME_GUARD_MS = 1000;

export function needsBackgroundAnchor(userAgent: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.userAgent): boolean {
  return typeof userAgent === 'string' && /Android/i.test(userAgent);
}

export function anchorWav(): Uint8Array {
  const samples = ANCHOR_SAMPLE_RATE * ANCHOR_SECONDS;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, ANCHOR_SAMPLE_RATE, true);
  view.setUint32(28, ANCHOR_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index += 1) {
    const value = Math.round(ANCHOR_AMPLITUDE * Math.sin((2 * Math.PI * ANCHOR_TONE_HZ * index) / ANCHOR_SAMPLE_RATE));
    view.setInt16(44 + index * 2, value, true);
  }
  return bytes;
}

export interface AnchorElement {
  src: string;
  loop: boolean;
  muted: boolean;
  volume: number;
  paused: boolean;
  preload: string;
  play: () => Promise<void>;
  pause: () => void;
  load: () => void;
  removeAttribute: (name: string) => void;
  setAttribute: (name: string, value: string) => void;
  addEventListener: (type: 'pause', listener: () => void) => void;
  removeEventListener: (type: 'pause', listener: () => void) => void;
}

export interface AnchorDeps {
  createElement: () => AnchorElement | null;
  createUrl: (bytes: Uint8Array) => string | null;
  revokeUrl: (url: string) => void;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  now: () => number;
  source?: ResumeSource | null;
  interactions?: Pick<Document, 'addEventListener' | 'removeEventListener'> | null;
}

export interface BackgroundAnchor {
  revive: () => void;
  stop: () => void;
}

function browserElement(): AnchorElement | null {
  try {
    return typeof Audio === 'undefined' ? null : new Audio();
  } catch {
    return null;
  }
}

function browserUrl(bytes: Uint8Array): string | null {
  try {
    return URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' }));
  } catch {
    return null;
  }
}

const defaultDeps: AnchorDeps = {
  createElement: browserElement,
  createUrl: browserUrl,
  revokeUrl: (url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      return;
    }
  },
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
  interactions: typeof document === 'undefined' ? null : document,
};

const NOOP_ANCHOR: BackgroundAnchor = { revive: () => undefined, stop: () => undefined };
const INTERACTIONS = ['pointerdown', 'keydown'] as const;

export function startBackgroundAnchor(overrides: Partial<AnchorDeps> = {}): BackgroundAnchor {
  const deps = { ...defaultDeps, ...overrides };
  const first = deps.createElement();
  if (!first) {
    return NOOP_ANCHOR;
  }
  const url = deps.createUrl(anchorWav());
  if (!url) {
    return NOOP_ANCHOR;
  }
  const page = deps.source === undefined ? browserSource() : deps.source;
  const isVisible = () => page?.document.visibilityState === 'visible';

  let element = first;
  let audible = false;
  let stopped = false;
  let retry: unknown = null;
  let failures = 0;
  let playingSince: number | null = null;
  let yieldedAt: number | null = null;

  const clearRetry = () => {
    if (retry !== null) {
      deps.clearTimer(retry);
      retry = null;
    }
  };

  const applyAudibility = () => {
    element.muted = isVisible();
    audible = audible || !element.muted;
  };

  const onPause = () => {
    if (stopped) {
      return;
    }
    if (playingSince === null) {
      return;
    }
    playingSince = null;
    yieldedAt = deps.now();
    clearRetry();
  };

  const mount = (target: AnchorElement) => {
    target.setAttribute('data-call-audio', 'anchor');
    target.preload = 'auto';
    target.loop = true;
    target.volume = 1;
    element = target;
    applyAudibility();
    target.src = url;
    target.addEventListener('pause', onPause);
  };

  const release = (target: AnchorElement) => {
    target.removeEventListener('pause', onPause);
    target.pause();
    target.removeAttribute('src');
    target.load();
  };

  const play = () => {
    if (stopped) {
      return;
    }
    clearRetry();
    if (audible && isVisible()) {
      replace();
    }
    applyAudibility();
    const target = element;
    let attempt: Promise<void>;
    try {
      attempt = target.play();
    } catch {
      schedule();
      return;
    }
    void Promise.resolve(attempt).then(
      () => {
        if (target === element && !stopped) {
          playingSince = deps.now();
        }
      },
      () => {
        if (target === element) {
          schedule();
        }
      },
    );
  };

  const schedule = () => {
    if (stopped || retry !== null || yieldedAt !== null || failures >= ANCHOR_RETRY_MS.length) {
      return;
    }
    const delay = ANCHOR_RETRY_MS[failures] ?? ANCHOR_RETRY_MS[0];
    failures += 1;
    retry = deps.setTimer(() => {
      retry = null;
      if (!stopped && element.paused) {
        play();
      }
    }, delay);
  };

  const replace = () => {
    const next = deps.createElement() ?? element;
    release(element);
    audible = false;
    playingSince = null;
    mount(next);
  };

  const revive = () => {
    if (stopped || !element.paused) {
      return;
    }
    if (yieldedAt !== null && deps.now() - yieldedAt < ANCHOR_RESUME_GUARD_MS) {
      return;
    }
    yieldedAt = null;
    failures = 0;
    play();
  };

  const onVisibility = () => {
    if (stopped) {
      return;
    }
    if (!isVisible() || !audible) {
      applyAudibility();
      return;
    }
    if (element.paused) {
      clearRetry();
      applyAudibility();
      return;
    }
    yieldedAt = null;
    failures = 0;
    play();
  };

  mount(first);
  page?.document.addEventListener('visibilitychange', onVisibility);
  const stopResume = onPageResume(revive, page);
  for (const type of INTERACTIONS) {
    deps.interactions?.addEventListener(type, revive, { capture: true, passive: true });
  }
  play();

  return {
    revive,
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearRetry();
      stopResume();
      page?.document.removeEventListener('visibilitychange', onVisibility);
      for (const type of INTERACTIONS) {
        deps.interactions?.removeEventListener(type, revive, { capture: true });
      }
      release(element);
      deps.revokeUrl(url);
    },
  };
}
