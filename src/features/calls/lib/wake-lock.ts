interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

let sentinel: WakeLockSentinelLike | null = null;

export async function acquireWakeLock(): Promise<void> {
  const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
  if (!wakeLock || sentinel) {
    return;
  }
  try {
    sentinel = await wakeLock.request('screen');
  } catch {
    sentinel = null;
  }
}

export function releaseWakeLock(): void {
  const current = sentinel;
  sentinel = null;
  void current?.release().catch(() => undefined);
}
