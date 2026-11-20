import { onPageResume } from './page-resume';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
}

interface WakeLockHost {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

let sentinel: WakeLockSentinelLike | null = null;
let wanted = false;
let stopResume: (() => void) | null = null;

function host(): WakeLockHost | undefined {
  return (navigator as Navigator & { wakeLock?: WakeLockHost }).wakeLock;
}

async function request(): Promise<void> {
  const wakeLock = host();
  if (!wakeLock || sentinel) {
    return;
  }
  try {
    const acquired = await wakeLock.request('screen');
    if (!wanted) {
      void acquired.release().catch(() => undefined);
      return;
    }
    sentinel = acquired;
    acquired.addEventListener?.('release', () => {
      if (sentinel === acquired) {
        sentinel = null;
      }
    });
  } catch {
    sentinel = null;
  }
}

export async function acquireWakeLock(): Promise<void> {
  wanted = true;
  stopResume ??= onPageResume(() => {
    if (wanted && document.visibilityState === 'visible') {
      void request();
    }
  });
  await request();
}

export function releaseWakeLock(): void {
  wanted = false;
  stopResume?.();
  stopResume = null;
  const current = sentinel;
  sentinel = null;
  void current?.release().catch(() => undefined);
}
