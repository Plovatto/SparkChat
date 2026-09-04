import { useEffect, type Dispatch, type SetStateAction } from 'react';

const DEFAULT_DELAY_MS = 5000;

export function useAutoDismiss(message: string, setMessage: Dispatch<SetStateAction<string>>, delayMs = DEFAULT_DELAY_MS): void {
  useEffect(() => {
    if (!message) {
      return;
    }

    const timer = setTimeout(() => setMessage(''), delayMs);
    return () => clearTimeout(timer);
  }, [message, setMessage, delayMs]);
}
