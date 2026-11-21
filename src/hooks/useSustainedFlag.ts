import { useEffect, useState } from 'react';

export function useSustainedFlag(active: boolean, delayMs: number): boolean {
  const [sustained, setSustained] = useState(false);

  useEffect(() => {
    if (!active) {
      setSustained(false);
      return;
    }
    const timer = window.setTimeout(() => setSustained(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return active && sustained;
}
