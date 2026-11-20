import { useCallback, useMemo, useRef, type MouseEvent, type PointerEvent } from 'react';

export interface BackdropDismissProps {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onClick: (event: MouseEvent<HTMLElement>) => void;
}

export function useBackdropDismiss(onDismiss: () => void): BackdropDismissProps {
  const pressStartedOnBackdropRef = useRef(false);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    pressStartedOnBackdropRef.current = event.target === event.currentTarget;
  }, []);

  const onClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      const pressStartedOnBackdrop = pressStartedOnBackdropRef.current;
      pressStartedOnBackdropRef.current = false;
      if (pressStartedOnBackdrop && event.target === event.currentTarget) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  return useMemo(() => ({ onPointerDown, onClick }), [onPointerDown, onClick]);
}
