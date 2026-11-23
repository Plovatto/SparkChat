import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { monitorSpeaking } from '../lib/audio-level';
import { autoplay } from '../lib/autoplay';
import { onPageResume } from '../lib/page-resume';

export function useSpeaking(stream: MediaStream | null, enabled: boolean): boolean {
  const [speaking, setSpeaking] = useState(false);
  const audioTrack = stream?.getAudioTracks()[0] ?? null;
  useEffect(() => {
    if (!stream || !enabled || !audioTrack) {
      setSpeaking(false);
      return;
    }
    const stop = monitorSpeaking(stream, setSpeaking);
    return () => {
      stop();
      setSpeaking(false);
    };
  }, [stream, enabled, audioTrack]);
  return speaking;
}

function trackKey(stream: MediaStream | null): string {
  return stream ? stream.getTracks().map((track) => track.id).join('|') : '';
}

export function useStreamOn(ref: RefObject<HTMLMediaElement | null>, stream: MediaStream | null): void {
  const boundKey = useRef('');
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const key = trackKey(stream);
    if (element.srcObject !== stream) {
      element.srcObject = stream;
    } else if (stream && boundKey.current !== key) {
      element.srcObject = null;
      element.srcObject = stream;
    }
    boundKey.current = key;
    if (stream) {
      autoplay.play(element);
    } else {
      autoplay.forget(element);
    }
  });
  useEffect(() => {
    const element = ref.current;
    if (!element || !stream) {
      return;
    }
    const tracks = stream.getVideoTracks?.() ?? [];
    const rebind = () => {
      if (element.srcObject !== stream) {
        return;
      }
      element.srcObject = null;
      element.srcObject = stream;
      autoplay.play(element);
    };
    const resume = () => {
      if (element.srcObject === stream && element.paused && (typeof document === 'undefined' || document.visibilityState !== 'hidden')) {
        autoplay.play(element);
      }
    };
    for (const track of tracks) {
      track.addEventListener('unmute', rebind);
    }
    element.addEventListener('pause', resume);
    const stopResume = onPageResume(() => {
      if (element.srcObject === stream) {
        autoplay.play(element);
      }
    });
    return () => {
      for (const track of tracks) {
        track.removeEventListener('unmute', rebind);
      }
      element.removeEventListener('pause', resume);
      stopResume();
    };
  });
}

const RIPPLE_ARM_MS = 4000;

export function useToggleRipple(pressed: boolean): readonly ['true' | undefined, () => void] {
  const [state, setState] = useState({ last: pressed, armed: false, ripple: false });
  if (state.last !== pressed) {
    setState({ last: pressed, armed: false, ripple: pressed && state.armed });
  }
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (disarm.current !== null) {
        clearTimeout(disarm.current);
      }
    },
    [],
  );
  const arm = useCallback(() => {
    setState((current) => (current.armed ? current : { ...current, armed: true }));
    if (disarm.current !== null) {
      clearTimeout(disarm.current);
    }
    disarm.current = setTimeout(() => {
      disarm.current = null;
      setState((current) => (current.armed ? { ...current, armed: false } : current));
    }, RIPPLE_ARM_MS);
  }, []);
  return [state.ripple && pressed ? 'true' : undefined, arm] as const;
}

export function useVideoOnly(stream: MediaStream | null): MediaStream | null {
  const track = stream?.getVideoTracks()[0] ?? null;
  return useMemo(() => (track && typeof MediaStream !== 'undefined' ? new MediaStream([track]) : null), [track]);
}

export function isOutside(target: EventTarget | null, ...elements: Array<{ contains: (node: Node) => boolean } | null>): boolean {
  if (!target) {
    return false;
  }
  return elements.every((element) => !element || !element.contains(target as Node));
}
