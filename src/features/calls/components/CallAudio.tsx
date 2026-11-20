import { useEffect, useMemo, type RefObject } from 'react';
import { useCall } from '../call-context';
import { autoplay } from '../lib/autoplay';
import { keepElementsPlaying } from '../lib/media-playback';
import { audioTrackKey, voiceOnly } from '../lib/voice-stream';
import { useStreamOn } from './call-hooks';

interface CallAudioProps {
  voiceRef: RefObject<HTMLAudioElement | null>;
  shareRef: RefObject<HTMLAudioElement | null>;
}

export function CallAudio({ voiceRef, shareRef }: CallAudioProps) {
  const { snapshot } = useCall();
  const { state } = snapshot;
  const running = state.phase === 'active' || state.phase === 'reconnecting';
  const remoteSharing = running && snapshot.remoteScreenOn && snapshot.remoteScreenStream !== null;
  const voiceTrackKey = audioTrackKey(snapshot.remoteStream);
  const voiceStream = useMemo(() => voiceOnly(snapshot.remoteStream, voiceTrackKey), [snapshot.remoteStream, voiceTrackKey]);

  useEffect(() => {
    const element = voiceRef.current;
    if (!element) {
      return;
    }
    if (element.srcObject !== voiceStream) {
      element.srcObject = voiceStream;
    }
    if (voiceStream) {
      autoplay.play(element);
    }
  }, [voiceStream, voiceRef]);

  useStreamOn(shareRef, remoteSharing ? snapshot.remoteScreenStream : null);

  useEffect(
    () =>
      keepElementsPlaying(() => [voiceRef.current, shareRef.current], {
        play: (element) => autoplay.play(element),
      }),
    [voiceRef, shareRef],
  );

  return (
    <>
      <audio ref={voiceRef} autoPlay data-call-audio="voice" />
      <audio ref={shareRef} autoPlay data-call-audio="share" />
    </>
  );
}
