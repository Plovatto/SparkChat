import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLinkPreview } from '@lib/api/link-preview';
import type { MessageLinkPreview } from '@lib/socket';
import { extractFirstUrl } from '../utils/extract-first-url';

const DEBOUNCE_MS = 600;

export interface UseLinkPreviewResult {
  preview: MessageLinkPreview | null;
  isLoading: boolean;
  dismiss: () => void;
  reset: () => void;
}

export function useLinkPreview(text: string, userId: string, sessionToken: string): UseLinkPreviewResult {
  const [preview, setPreview] = useState<MessageLinkPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const dismissedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const url = extractFirstUrl(text);

    if (!url || url === dismissedUrlRef.current) {
      setPreview(null);
      setIsLoading(false);
      return;
    }

    setPreview((current) => (current?.url === url ? current : null));

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      setIsLoading(true);
      fetchLinkPreview(url, { userId, sessionToken })
        .then((result) => {
          if (!cancelled) {
            setPreview(result);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPreview(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [text, userId, sessionToken]);

  const dismiss = useCallback(() => {
    dismissedUrlRef.current = preview?.url ?? extractFirstUrl(text);
    setPreview(null);
  }, [preview, text]);

  const reset = useCallback(() => {
    dismissedUrlRef.current = null;
    setPreview(null);
  }, []);

  return { preview, isLoading, dismiss, reset };
}
