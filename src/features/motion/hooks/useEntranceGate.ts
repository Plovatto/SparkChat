import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_SETTLE_DELAY_MS = 400;

export type EntrancePhase = 'none' | 'initial' | 'live';

export interface EntranceGate {
  getEntrancePhase: () => EntrancePhase;
  suspendEntrance: (durationMs?: number) => void;
}

export function useEntranceGate(isReady: boolean, resetKey: string | null, settleDelayMs = DEFAULT_SETTLE_DELAY_MS): EntranceGate {
  const phaseRef = useRef<EntrancePhase>('initial');
  const resetKeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  if (resetKeyRef.current !== resetKey) {
    resetKeyRef.current = resetKey;
    phaseRef.current = 'initial';
  }

  const clearPendingPhase = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearPendingPhase();

    if (!isReady) {
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      phaseRef.current = 'live';
    }, settleDelayMs);

    return clearPendingPhase;
  }, [isReady, resetKey, settleDelayMs, clearPendingPhase]);

  const suspendEntrance = useCallback(
    (durationMs = settleDelayMs) => {
      clearPendingPhase();
      phaseRef.current = 'none';
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        phaseRef.current = 'live';
      }, durationMs);
    },
    [clearPendingPhase, settleDelayMs],
  );

  const getEntrancePhase = useCallback(() => phaseRef.current, []);

  return { getEntrancePhase, suspendEntrance };
}
