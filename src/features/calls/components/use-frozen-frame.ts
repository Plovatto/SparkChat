import { useEffect, useRef, useState, type RefObject } from 'react';
import { drawFrame, watchTrackMute } from '../lib/frozen-frame';

export interface FrozenFrame {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  frozen: boolean;
}

export function useFrozenFrame(videoRef: RefObject<HTMLVideoElement | null>, stream: MediaStream | null, enabled: boolean, hold: boolean): FrozenFrame {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trackMuted, setTrackMuted] = useState(false);
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    setTrackMuted(false);
    if (!enabled || !stream) {
      return;
    }
    const capture = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ok = video && canvas ? drawFrame(video, canvas) : false;
      setCaptured(ok);
      setTrackMuted(true);
    };
    return watchTrackMute(stream.getVideoTracks(), capture, () => setTrackMuted(false));
  }, [stream, enabled, videoRef]);

  useEffect(() => {
    if (!enabled || !hold) {
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    setCaptured(video && canvas ? drawFrame(video, canvas) : false);
  }, [enabled, hold, videoRef]);

  return { canvasRef, frozen: enabled && captured && (trackMuted || hold) };
}
