import { useSyncExternalStore } from 'react';
import { getItem, setItem } from '@lib/storage';

const PROTECT_IP_KEY = 'chatCallProtectIp';

type Listener = () => void;

const listeners = new Set<Listener>();

export function getProtectIp(): boolean {
  return getItem<boolean>(PROTECT_IP_KEY) === true;
}

export function setProtectIp(value: boolean): void {
  setItem(PROTECT_IP_KEY, value);
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

export function subscribeProtectIp(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === PROTECT_IP_KEY) {
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useProtectIp(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribeProtectIp, getProtectIp, () => false);
  return [value, setProtectIp];
}
