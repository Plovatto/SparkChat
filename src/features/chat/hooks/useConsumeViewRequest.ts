import { useEffect, useRef } from 'react';

export interface ViewRequest<View extends string> {
  view: View;
  nonce: number;
}

export function useConsumeViewRequest<View extends string>(
  isOpen: boolean,
  request: ViewRequest<View> | undefined,
  apply: (view: View) => void,
): void {
  const handledNonce = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen && request && handledNonce.current !== request.nonce) {
      handledNonce.current = request.nonce;
      apply(request.view);
    }
  }, [isOpen, request, apply]);
}
