import { useCallback, useEffect, useRef, useState } from 'react';

type TorchCapableTrack = { getCapabilities?: () => { torch?: boolean } };

export interface TorchControl {
  supported: boolean;
  on: boolean;
  toggle: () => Promise<void>;
  release: () => void;
}

function torchSupported(track: MediaStreamTrack | null): boolean {
  if (!track || track.readyState === 'ended') {
    return false;
  }
  try {
    return (track as unknown as TorchCapableTrack).getCapabilities?.().torch === true;
  } catch {
    return false;
  }
}

function applyTorch(track: MediaStreamTrack, torch: boolean): Promise<void> {
  try {
    return track.applyConstraints({ advanced: [{ torch } as MediaTrackConstraintSet] });
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

function switchOff(track: MediaStreamTrack): void {
  if (track.readyState !== 'ended') {
    applyTorch(track, false).catch(() => undefined);
  }
}

export function useTorch(track: MediaStreamTrack | null): TorchControl {
  const [ended, setEnded] = useState<MediaStreamTrack | null>(null);
  const [lit, setLit] = useState<{ track: MediaStreamTrack | null; on: boolean }>({ track: null, on: false });
  const wanted = useRef(false);
  const current = useRef(track);
  const litTrack = useRef<MediaStreamTrack | null>(null);

  const supported = ended !== track && torchSupported(track);

  const on = supported && lit.on && lit.track === track;

  useEffect(() => {
    current.current = track;
    const previous = litTrack.current;
    if (previous && previous !== track) {
      litTrack.current = null;
      switchOff(previous);
    }
    if (!track || !supported) {
      wanted.current = false;
      return;
    }
    if (!wanted.current) {
      return;
    }
    let live = true;
    applyTorch(track, true).then(
      () => {
        if (live && current.current === track) {
          litTrack.current = track;
          setLit({ track, on: true });
        }
      },
      () => {
        if (live && current.current === track) {
          wanted.current = false;
          setLit({ track: null, on: false });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [track, supported]);

  useEffect(() => {
    if (!track) {
      return;
    }
    const onEnded = () => {
      wanted.current = false;
      if (litTrack.current === track) {
        litTrack.current = null;
      }
      setEnded(track);
      setLit({ track: null, on: false });
    };
    track.addEventListener('ended', onEnded);
    return () => track.removeEventListener('ended', onEnded);
  }, [track]);

  useEffect(() => {
    if (!track || !supported) {
      return;
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !wanted.current || current.current !== track || track.readyState === 'ended') {
        return;
      }
      applyTorch(track, true).catch(() => {
        if (current.current === track) {
          wanted.current = false;
          litTrack.current = null;
          setLit({ track: null, on: false });
        }
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [track, supported]);

  useEffect(
    () => () => {
      const previous = litTrack.current;
      litTrack.current = null;
      if (previous) {
        switchOff(previous);
      }
    },
    [],
  );

  const toggle = useCallback(async () => {
    const target = current.current;
    if (!target || !torchSupported(target)) {
      return;
    }
    const next = !(wanted.current && litTrack.current === target);
    try {
      await applyTorch(target, next);
    } catch {
      return;
    }
    if (current.current !== target) {
      if (next) {
        switchOff(target);
      }
      return;
    }
    wanted.current = next;
    litTrack.current = next ? target : null;
    setLit({ track: next ? target : null, on: next });
  }, []);

  const release = useCallback(() => {
    const previous = litTrack.current;
    wanted.current = false;
    litTrack.current = null;
    if (previous) {
      switchOff(previous);
      setLit({ track: null, on: false });
    }
  }, []);

  return { supported, on, toggle, release };
}
