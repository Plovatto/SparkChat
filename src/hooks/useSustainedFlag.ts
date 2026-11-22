import { useEffect, useState } from 'react';

interface SustainedFlagOptions {
  restartWhenVisible?: boolean;
}

export function useSustainedFlag(active: boolean, delayMs: number, options: SustainedFlagOptions = {}): boolean {
  const [sustained, setSustained] = useState(false);
  const restartWhenVisible = options.restartWhenVisible === true;

  useEffect(() => {
    if (!active) {
      setSustained(false);
      return;
    }
    let timer = window.setTimeout(() => setSustained(true), delayMs);
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      window.clearTimeout(timer);
      setSustained(false);
      timer = window.setTimeout(() => setSustained(true), delayMs);
    };
    if (restartWhenVisible) {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      window.clearTimeout(timer);
      if (restartWhenVisible) {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [active, delayMs, restartWhenVisible]);

  return active && sustained;
}
