import { useEffect, useState } from 'react';
import { fetchGifMedia } from '@lib/api/gifs';
import type { SessionAuth } from '@lib/api/session-auth';
import { gifMediaCache, type GifMediaEntry } from '../utils/gif-media-cache';

export interface GifMediaState {
  entry: GifMediaEntry | null;
  failed: boolean;
}

export function useGifMedia(url: string, auth: SessionAuth, shouldLoad: boolean): GifMediaState {
  const [state, setState] = useState<GifMediaState>(() => ({ entry: gifMediaCache.peek(url) ?? null, failed: false }));

  useEffect(() => {
    if (!shouldLoad || state.entry) {
      return;
    }
    let isActive = true;
    void gifMediaCache.load(url, (mediaUrl) => fetchGifMedia(mediaUrl, auth)).then((entry) => {
      if (isActive) {
        setState({ entry, failed: entry === null });
      }
    });
    return () => {
      isActive = false;
    };
  }, [url, auth, shouldLoad, state.entry]);

  return state;
}
