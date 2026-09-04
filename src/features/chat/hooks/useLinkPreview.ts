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
  const [preview, setPreview] = useState<MessageLinkPreview | null>(null);
  const dismissedUrlRef = useRef<string | null>(null);
  const { userId, sessionToken } = auth;

  useEffect(() => {
    const url = extractFirstUrl(text);

    if (!url || url === dismissedUrlRef.current) {
      setPreview(null);
      return;
    }

    setPreview((current) => (current?.url === url ? current : null));

    let cancelled = false;
    const timeoutId = setTimeout(() => {
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

  return { preview, dismiss, reset };
}
