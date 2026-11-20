import { useEffect, useSyncExternalStore } from 'react';
import { getInstallSnapshot, refreshInstallState, subscribeInstallState, type InstallSnapshot } from '../lib/install-state';

export function useInstallState(): InstallSnapshot {
  const snapshot = useSyncExternalStore(subscribeInstallState, getInstallSnapshot, getInstallSnapshot);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia('(display-mode: standalone)');
    query.addEventListener('change', refreshInstallState);
    return () => query.removeEventListener('change', refreshInstallState);
  }, []);

  return snapshot;
}
