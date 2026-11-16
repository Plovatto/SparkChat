import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLinkPreview } from '@lib/api/link-preview';
import type { SessionAuth } from '@lib/api/session-auth';
import type { MessageLinkPreview } from '@lib/socket';
import { extractFirstUrl } from '../utils/extract-first-url';

const DEBOUNCE_MS = 600;

export interface LinkPreviewControls {
  preview: MessageLinkPreview | null;
  dismiss: () => void;
  reset: () => void;
}

export function useLinkPreview(text: string, auth: SessionAuth): LinkPreviewControls {
  const [entry, setEntry] = useState<{ sourceUrl: string; preview: MessageLinkPreview } | null>(null);
  const dismissedUrlRef = useRef<string | null>(null);
  const preview = entry?.preview ?? null;
  const sourceUrl = entry?.sourceUrl ?? null;
  const { userId, sessionToken } = auth;

  useEffect(() => {
    const url = extractFirstUrl(text);

    if (!url || url === dismissedUrlRef.current) {
      setEntry(null);
      return;
    }

    if (url === sourceUrl) {
      return;
    }
    setEntry(null);

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      fetchLinkPreview(url, { userId, sessionToken })
        .then((result) => {
          if (!cancelled) {
            setEntry(result ? { sourceUrl: url, preview: result } : null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setEntry(null);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [text, userId, sessionToken, sourceUrl]);

  const dismiss = useCallback(() => {
    dismissedUrlRef.current = sourceUrl ?? extractFirstUrl(text);
    setEntry(null);
  }, [sourceUrl, text]);

  const reset = useCallback(() => {
    dismissedUrlRef.current = null;
    setEntry(null);
  }, []);

  return { preview, dismiss, reset };
}
