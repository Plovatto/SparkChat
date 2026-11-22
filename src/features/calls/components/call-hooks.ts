import { useEffect, useRef, useState, type RefObject } from 'react';
import { monitorSpeaking } from '../lib/audio-level';
import { autoplay } from '../lib/autoplay';

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
}

export function isOutside(target: EventTarget | null, ...elements: Array<{ contains: (node: Node) => boolean } | null>): boolean {
  if (!target) {
    return false;
  }
  return elements.every((element) => !element || !element.contains(target as Node));
}
