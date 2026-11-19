import { useEffect, useState, useSyncExternalStore } from 'react';
import { fetchTrendingGifs, searchGifs, type GifLocale } from '@lib/api/gifs';
import type { SessionAuth } from '@lib/api/session-auth';
import { createGifGalleryController, type GifGalleryController, type GifGalleryState } from '../utils/gif-gallery-controller';

export interface GifGallery {
  state: GifGalleryState;
  controller: GifGalleryController;
}

export function useGifGallery(auth: SessionAuth, locale: GifLocale): GifGallery {
  const [controller] = useState(() =>
    createGifGalleryController({
      trending: (page, signal) => fetchTrendingGifs(auth, { page, locale }, signal),
      search: (q, page, signal) => searchGifs(auth, { q, page, locale }, signal),
    }),
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);

  return { state, controller };
}
