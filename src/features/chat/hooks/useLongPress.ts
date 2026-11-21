import { useCallback, useEffect, useRef, type PointerEvent } from 'react';

export const LONG_PRESS_DELAY_MS = 450;
const MOVE_TOLERANCE_PX = 10;
const RELEASE_CLICK_WINDOW_MS = 400;

interface LongPressOptions {
  onLongPress: () => void;
  enabled?: boolean;
  touchOnly?: boolean;
  delayMs?: number;
}

export interface LongPressHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
}

export interface LongPressControls {
  handlers: LongPressHandlers;
  consumeLongPress: () => boolean;
}

export function useLongPress({ onLongPress, enabled = true, touchOnly = true, delayMs = LONG_PRESS_DELAY_MS }: LongPressOptions): LongPressControls {
  const timerRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const releasedAtRef = useRef<number | null>(null);
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      firedRef.current = false;
      releasedAtRef.current = null;
      if (!enabled || (touchOnly && event.pointerType !== 'touch') || event.button > 0) {
        return;
      }
      cancel();
      originRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        originRef.current = null;
        firedRef.current = true;
        releasedAtRef.current = null;
        callbackRef.current();
      }, delayMs);
    },
    [enabled, touchOnly, delayMs, cancel],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const origin = originRef.current;
      if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > MOVE_TOLERANCE_PX) {
        cancel();
      }
    },
    [cancel],
  );

  const onPointerUp = useCallback(() => {
    if (firedRef.current && releasedAtRef.current === null) {
      releasedAtRef.current = performance.now();
    }
    cancel();
  }, [cancel]);

  const consumeLongPress = useCallback(() => {
    const releasedAt = releasedAtRef.current;
    const fired = firedRef.current && (releasedAt === null || performance.now() - releasedAt <= RELEASE_CLICK_WINDOW_MS);
    firedRef.current = false;
    releasedAtRef.current = null;
    return fired;
  }, []);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: cancel, onPointerLeave: cancel },
    consumeLongPress,
  };
}
