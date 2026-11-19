import { fetchTrendingGifs, searchGifs, type GifLocale } from '@lib/api/gifs';
import type { SessionAuth } from '@lib/api/session-auth';
import type { GifGallerySource } from './gif-gallery-controller';

export interface GifRequestContext {
  auth: SessionAuth;
  locale: GifLocale;
}

export function createGifSource(getContext: () => GifRequestContext): GifGallerySource {
  return {
    trending: (page, signal) => {
      const { auth, locale } = getContext();
      return fetchTrendingGifs(auth, { page, locale }, signal);
    },
    search: (q, page, signal) => {
      const { auth, locale } = getContext();
      return searchGifs(auth, { q, page, locale }, signal);
    },
  };
}
