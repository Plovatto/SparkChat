import { useEffect, useMemo, type RefObject } from 'react';
import { useCall } from '../call-context';
import { autoplay } from '../lib/autoplay';
import { useCallVolume } from '../lib/call-settings';
import { keepElementsPlaying } from '../lib/media-playback';
import { audioTrackKey, voiceOnly } from '../lib/voice-stream';
import { useStreamOn } from './call-hooks';
import { useVoicePlayback } from './use-voice-playback';

interface CallAudioProps {
  voiceRef: RefObject<HTMLAudioElement | null>;
  shareRef: RefObject<HTMLAudioElement | null>;
  monitorRef: RefObject<HTMLAudioElement | null>;
}

export function CallAudio({ voiceRef, shareRef, monitorRef }: CallAudioProps) {
  const { snapshot } = useCall();
  const { state } = snapshot;
  const running = state.phase === 'active' || state.phase === 'reconnecting';
  const remoteSharing = running && snapshot.remoteScreenOn && snapshot.remoteScreenStream !== null;
  const voiceTrackKey = audioTrackKey(snapshot.remoteStream);
  const voiceStream = useMemo(() => voiceOnly(snapshot.remoteStream, voiceTrackKey), [snapshot.remoteStream, voiceTrackKey]);

  const [callVolumeLevel] = useCallVolume();
  useVoicePlayback(voiceRef, voiceStream, callVolumeLevel);

  useStreamOn(shareRef, remoteSharing ? snapshot.remoteScreenStream : null);

  useEffect(
    () =>
      keepElementsPlaying(() => [voiceRef.current, shareRef.current, monitorRef.current], {
        play: (element) => autoplay.play(element),
      }),
    [voiceRef, shareRef, monitorRef],
  );

  return (
    <>
      <audio ref={voiceRef} autoPlay data-call-audio="voice" />
      <audio ref={shareRef} autoPlay data-call-audio="share" />
      <audio ref={monitorRef} data-call-audio="monitor" />
    </>
  );
}
