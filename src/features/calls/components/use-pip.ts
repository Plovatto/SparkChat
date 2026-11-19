import { useCallback, useEffect, useRef, useState } from 'react';
import { copyStyles, PIP_WINDOW_SIZE, registerAutoPip, type DocumentPipHost, type PipMode } from '../lib/picture-in-picture';

interface UsePipOptions {
  mode: PipMode;
  videoFor: () => HTMLVideoElement | null;
  active: boolean;
  auto: boolean;
}

export function usePip({ mode, videoFor, active, auto }: UsePipOptions): { open: boolean; window: Window | null; toggle: () => void } {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const videoForRef = useRef(videoFor);
  videoForRef.current = videoFor;

  const close = useCallback(() => {
    setPipWindow((current) => {
      current?.close();
      return null;
    });
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined);
    }
  }, []);

  const openPip = useCallback(async () => {
    if (mode === 'document') {
      const host = (window as Window & { documentPictureInPicture?: DocumentPipHost }).documentPictureInPicture;
      if (!host || host.window) {
        return;
      }
      try {
        const opened = await host.requestWindow({ ...PIP_WINDOW_SIZE });
        copyStyles(document, opened.document);
        opened.addEventListener('pagehide', () => setPipWindow(null), { once: true });
        setPipWindow(opened);
      } catch {
        return;
      }
      return;
    }
    if (mode === 'video') {
      const video = videoForRef.current();
      if (!video) {
        return;
      }
      try {
        await video.requestPictureInPicture();
        setVideoOpen(true);
        video.addEventListener('leavepictureinpicture', () => setVideoOpen(false), { once: true });
      } catch {
        return;
      }
    }
  }, [mode]);

  useEffect(() => {
    if (!active) {
      close();
      setVideoOpen(false);
    }
  }, [active, close]);

  useEffect(() => close, [close]);

  useEffect(() => {
    if (!auto || !mode) {
      return;
    }
    return registerAutoPip(() => void openPip());
  }, [auto, mode, openPip]);

  const open = pipWindow !== null || videoOpen;
  const toggle = () => {
    if (open) {
      close();
      setVideoOpen(false);
    } else {
      void openPip();
    }
  };
  return { open, window: pipWindow, toggle };
}
