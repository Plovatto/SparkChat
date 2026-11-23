import { onPageResume, type ResumeSource } from './page-resume';

export const ANCHOR_SAMPLE_RATE = 8000;
export const ANCHOR_SECONDS = 8;
export const ANCHOR_TONE_HZ = 30;
export const ANCHOR_AMPLITUDE = 100;
export const ANCHOR_RETRY_MS = [1000, 3000, 10000, 30000] as const;
export const ANCHOR_STABLE_MS = 5000;

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
  const element = deps.createElement();
  if (!element) {
    return NOOP_ANCHOR;
  }
  const url = deps.createUrl(anchorWav());
  if (!url) {
    return NOOP_ANCHOR;
  }
  element.setAttribute('data-call-audio', 'anchor');
  element.preload = 'auto';
  element.loop = true;
  element.muted = false;
  element.volume = 1;
  element.src = url;

  let stopped = false;
  let retry: unknown = null;
  let failures = 0;
  let playingSince: number | null = null;

  const clearRetry = () => {
    if (retry !== null) {
      deps.clearTimer(retry);
      retry = null;
    }
  };

  const play = () => {
    if (stopped) {
      return;
    }
    clearRetry();
    element.muted = false;
    let attempt: Promise<void>;
    try {
      attempt = element.play();
    } catch {
      schedule();
      return;
    }
    void Promise.resolve(attempt).then(
      () => {
        playingSince = deps.now();
      },
      () => schedule(),
    );
  };

  const schedule = () => {
    if (stopped || retry !== null) {
      return;
    }
    const delay = ANCHOR_RETRY_MS[Math.min(failures, ANCHOR_RETRY_MS.length - 1)] ?? ANCHOR_RETRY_MS[0];
    failures += 1;
    retry = deps.setTimer(() => {
      retry = null;
      if (!stopped && element.paused) {
        play();
      }
    }, delay);
  };

  const onPause = () => {
    if (stopped) {
      return;
    }
    if (playingSince !== null && deps.now() - playingSince >= ANCHOR_STABLE_MS) {
      failures = 0;
    }
    playingSince = null;
    schedule();
  };

  const revive = () => {
    if (!stopped && element.paused) {
      play();
    }
  };

  element.addEventListener('pause', onPause);
  const stopResume = deps.source === undefined ? onPageResume(revive) : onPageResume(revive, deps.source);
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
      element.removeEventListener('pause', onPause);
      for (const type of INTERACTIONS) {
        deps.interactions?.removeEventListener(type, revive, { capture: true });
      }
      element.pause();
      element.removeAttribute('src');
      element.load();
      deps.revokeUrl(url);
    },
  };
}
