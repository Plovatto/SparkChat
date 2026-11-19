import { useCallback, useRef, useState } from 'react';
import { fetchLinkPreview, fetchLinkPreviewImageBlob } from '@lib/api/link-preview';
import type { SessionAuth } from '@lib/api/session-auth';
import { buildLinkPreviewThumbnail } from '@lib/media/image-compression';
import { loadComposerLinkPreview, type ComposerLinkPreview } from '../utils/composer-link-preview';
import { extractFirstUrl } from '../utils/extract-first-url';

export type LinkPreviewStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface LinkPreviewControls {
  url: string | null;
  status: LinkPreviewStatus;
  preview: ComposerLinkPreview | null;
  generate: () => void;
  dismiss: () => void;
  reset: () => void;
}

interface LinkPreviewEntry {
  sourceUrl: string;
  status: Exclude<LinkPreviewStatus, 'idle'>;
  preview: ComposerLinkPreview | null;
}

const PREVIEW_DEPS = {
  fetchPreview: fetchLinkPreview,
  fetchImage: fetchLinkPreviewImageBlob,
  normalizeImage: buildLinkPreviewThumbnail,
};

export function useLinkPreview(text: string, auth: SessionAuth): LinkPreviewControls {
  const [entry, setEntry] = useState<LinkPreviewEntry | null>(null);
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const { userId, sessionToken } = auth;

  const typedUrl = extractFirstUrl(text);
  const url = typedUrl && typedUrl !== dismissedUrl ? typedUrl : null;
  const current = entry && url && entry.sourceUrl === url ? entry : null;

  const generate = useCallback(() => {
    if (!url) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setEntry({ sourceUrl: url, status: 'loading', preview: null });

    void loadComposerLinkPreview(url, { userId, sessionToken }, PREVIEW_DEPS)
      .catch(() => null)
      .then((preview) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setEntry({ sourceUrl: url, status: preview ? 'ready' : 'failed', preview });
      });
  }, [url, userId, sessionToken]);

  const dismiss = useCallback(() => {
    requestIdRef.current += 1;
    setDismissedUrl(url);
    setEntry(null);
  }, [url]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setDismissedUrl(null);
    setEntry(null);
  }, []);

  return {
    url,
    status: current?.status ?? 'idle',
    preview: current?.status === 'ready' ? current.preview : null,
    generate,
    dismiss,
    reset,
  };
}
