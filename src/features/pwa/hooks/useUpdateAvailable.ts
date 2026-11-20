import { useSyncExternalStore } from 'react';
import { isUpdateAvailable, subscribeUpdateAvailable } from '../lib/sw-registration';

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(subscribeUpdateAvailable, isUpdateAvailable, isUpdateAvailable);
}
