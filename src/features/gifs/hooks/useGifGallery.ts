import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { GifLocale } from '@lib/api/gifs';
import type { SessionAuth } from '@lib/api/session-auth';
import { createGifGalleryController, type GifGalleryController, type GifGalleryState } from '../utils/gif-gallery-controller';
import { createGifSource, type GifRequestContext } from '../utils/gif-source';

export interface GifGallery {
  state: GifGalleryState;
  controller: GifGalleryController;
}

export function useGifGallery(auth: SessionAuth, locale: GifLocale): GifGallery {
  const contextRef = useRef<GifRequestContext>({ auth, locale });
  const [controller] = useState(() => createGifGalleryController(createGifSource(() => contextRef.current)));
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useEffect(() => {
    contextRef.current = { auth, locale };
  }, [auth, locale]);

  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller, locale]);

  return { state, controller };
}
