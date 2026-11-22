import { createContext, useContext } from 'react';

export interface MediaViewerApi {
  open: (messageId: string) => boolean;
}

export const MediaViewerContext = createContext<MediaViewerApi | null>(null);

export function useMediaViewer(): MediaViewerApi | null {
  return useContext(MediaViewerContext);
}
