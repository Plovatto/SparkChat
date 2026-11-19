import { useEffect, useState } from 'react';
import type { SessionAuth } from '@lib/api/session-auth';
import { loadGifStatus } from '../utils/gif-status-cache';

export function useGifStatus(auth: SessionAuth): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let isActive = true;
    void loadGifStatus(auth).then((value) => {
      if (isActive) {
        setEnabled(value);
      }
    });
    return () => {
      isActive = false;
    };
  }, [auth]);

  return enabled;
}
