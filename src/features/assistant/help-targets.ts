import { useEffect, useSyncExternalStore } from 'react';
import { isInstallAvailable, requestInstall, useInstallState } from '@features/pwa';
import type { HelpTarget } from '@lib/assistant/assistant-card';

type OpenableTarget = Exclude<HelpTarget, 'none' | 'install'>;

const openers = new Map<OpenableTarget, () => void>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isOpenable(target: HelpTarget): target is OpenableTarget {
  return target !== 'none' && target !== 'install';
}

export function registerHelpOpener(target: OpenableTarget, opener: () => void): () => void {
  openers.set(target, opener);
  notify();
  return () => {
    if (openers.get(target) === opener) {
      openers.delete(target);
      notify();
    }
  };
}

export function useHelpOpener(target: OpenableTarget, opener: (() => void) | null): void {
  useEffect(() => (opener ? registerHelpOpener(target, opener) : undefined), [target, opener]);
}

export function openHelpTarget(target: HelpTarget): void {
  if (target === 'install') {
    void requestInstall();
    return;
  }
  if (isOpenable(target)) {
    openers.get(target)?.();
  }
}

export function useCanOpenHelpTarget(target: HelpTarget): boolean {
  const install = useInstallState();
  const registered = useSyncExternalStore(
    subscribe,
    () => isOpenable(target) && openers.has(target),
    () => false,
  );
  return target === 'install' ? isInstallAvailable(install) : registered;
}
