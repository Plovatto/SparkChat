import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_KEY = 'default';
const DEFAULT_RESET_DELAY_MS = 2000;

export interface ClipboardCopyControls {
  copiedKey: string | null;
  isCopied: (key?: string) => boolean;
  copy: (text: string, key?: string) => void;
}

export function useClipboardCopy(resetDelayMs = DEFAULT_RESET_DELAY_MS): ClipboardCopyControls {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const copy = useCallback(
    (text: string, key: string = DEFAULT_KEY) => {
      if (!navigator.clipboard) {
        return;
      }

      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopiedKey(key);
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => setCopiedKey(null), resetDelayMs);
        })
        .catch(() => setCopiedKey(null));
    },
    [resetDelayMs],
  );

  const isCopied = useCallback((key: string = DEFAULT_KEY) => copiedKey === key, [copiedKey]);

  return { copiedKey, isCopied, copy };
}
