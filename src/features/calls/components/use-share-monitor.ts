import { useEffect, useRef, type RefObject } from 'react';
import { startShareMonitor, type ShareMonitor } from '../lib/share-monitor';

export function useShareMonitor(elementRef: RefObject<HTMLAudioElement | null>, track: MediaStreamTrack | null, volume: number): void {
  const monitorRef = useRef<ShareMonitor | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !track) {
      return;
    }
    const monitor = startShareMonitor(element, track, volumeRef.current);
    monitorRef.current = monitor;
    return () => {
      monitor.stop();
      if (monitorRef.current === monitor) {
        monitorRef.current = null;
      }
    };
  }, [elementRef, track]);

  useEffect(() => {
    monitorRef.current?.setVolume(volume);
  }, [volume]);
}
