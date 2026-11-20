import { useEffect, useRef, type RefObject } from 'react';
import { autoplay } from '../lib/autoplay';
import { createPlaybackBoost, playbackPlan, type PlaybackBoost } from '../lib/voice-playback';

export function useVoicePlayback(ref: RefObject<HTMLAudioElement | null>, stream: MediaStream | null, volume: number): void {
  const plan = playbackPlan(volume);
  const boostRef = useRef<PlaybackBoost | null>(null);
  const gainRef = useRef(plan.gain);
  gainRef.current = plan.gain;

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const boost = stream && plan.boosted ? createPlaybackBoost(stream, gainRef.current) : null;
    boostRef.current = boost;
    const source = boost ? boost.stream : stream;
    if (element.srcObject !== source) {
      element.srcObject = source;
    }
    if (source) {
      autoplay.play(element);
    }
    return () => {
      boostRef.current = null;
      boost?.stop();
    };
  }, [ref, stream, plan.boosted]);

  useEffect(() => {
    const element = ref.current;
    if (element) {
      element.volume = boostRef.current ? 1 : plan.elementVolume;
    }
    boostRef.current?.setGain(plan.gain);
  }, [ref, plan.elementVolume, plan.gain, plan.boosted, stream]);
}
