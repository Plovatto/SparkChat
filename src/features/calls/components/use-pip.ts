import { useCallback, useEffect, useRef, useState } from 'react';
import { copyStyles, PIP_WINDOW_SIZE, registerAutoPip, type DocumentPipHost, type PipMode } from '../lib/picture-in-picture';

interface UsePipOptions {
  mode: PipMode;
  videoFor: () => HTMLVideoElement | null;
  active: boolean;
  auto: boolean;
  onUserClose?: () => void;
}

export interface PipControls {
  open: boolean;
  window: Window | null;
  toggle: () => void;
  openPip: () => Promise<void>;
  close: () => void;
}

export function usePip({ mode, videoFor, active, auto, onUserClose }: UsePipOptions): PipControls {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const videoForRef = useRef(videoFor);
  videoForRef.current = videoFor;
  const onUserCloseRef = useRef(onUserClose);
  onUserCloseRef.current = onUserClose;
  const windowRef = useRef<Window | null>(null);
  const closingRef = useRef(false);

  const close = useCallback(() => {
    const current = windowRef.current;
    const pipVideo = typeof document !== 'undefined' ? document.pictureInPictureElement : null;
    windowRef.current = null;
    if (current || pipVideo) {
      closingRef.current = true;
    }
    current?.close();
    setPipWindow(null);
    setVideoOpen(false);
    if (pipVideo) {
      void document.exitPictureInPicture().catch(() => {
        closingRef.current = false;
      });
    }
  }, []);

  const closedBy = useCallback(() => {
    if (closingRef.current) {
      closingRef.current = false;
      return;
    }
    onUserCloseRef.current?.();
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
        opened.addEventListener(
          'pagehide',
          () => {
            if (windowRef.current === opened) {
              windowRef.current = null;
            }
            setPipWindow(null);
            closedBy();
          },
          { once: true },
        );
        windowRef.current = opened;
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
        video.addEventListener(
          'leavepictureinpicture',
          () => {
            setVideoOpen(false);
            closedBy();
          },
          { once: true },
        );
      } catch {
        return;
      }
    }
  }, [mode, closedBy]);

  useEffect(() => {
    if (!active) {
      close();
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
    } else {
      void openPip();
    }
  };
  return { open, window: pipWindow, toggle, openPip, close };
}
