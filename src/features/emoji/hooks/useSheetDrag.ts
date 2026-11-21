import { useCallback, useRef, useState, type PointerEvent } from 'react';
import { shouldDismissSheet } from '../utils/picker-layout';

interface DragStart {
  pointerId: number;
  y: number;
  time: number;
}

export interface SheetDrag {
  offset: number;
  isDragging: boolean;
  handlers: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  };
}

export function useSheetDrag(onDismiss: () => void): SheetDrag {
  const startRef = useRef<DragStart | null>(null);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    startRef.current = { pointerId: event.pointerId, y: event.clientY, time: event.timeStamp };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) {
      return;
    }
    setOffset(Math.max(0, event.clientY - start.y));
  }, []);

  const finish = useCallback(
    (event: PointerEvent<HTMLElement>, allowDismiss: boolean) => {
      const start = startRef.current;
      if (!start || start.pointerId !== event.pointerId) {
        return;
      }
      startRef.current = null;
      setIsDragging(false);
      const distance = Math.max(0, event.clientY - start.y);
      const elapsed = Math.max(1, event.timeStamp - start.time);
      if (allowDismiss && shouldDismissSheet(distance, distance / elapsed)) {
        onDismiss();
        return;
      }
      setOffset(0);
    },
    [onDismiss],
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => finish(event, true), [finish]);
  const onPointerCancel = useCallback((event: PointerEvent<HTMLElement>) => finish(event, false), [finish]);

  return { offset, isDragging, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}
