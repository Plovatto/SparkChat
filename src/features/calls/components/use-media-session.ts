import { useEffect, useRef } from 'react';
import { startCallMediaSession, type CallMediaSession, type CallMediaSessionOptions } from '../lib/call-media-session';

export function useCallMediaSession(active: boolean, options: CallMediaSessionOptions): void {
  const latest = useRef(options);
  latest.current = options;
  const sessionRef = useRef<CallMediaSession | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    const session = startCallMediaSession({
      ...latest.current,
      onHangup: () => latest.current.onHangup(),
      onToggleMicrophone: () => latest.current.onToggleMicrophone(),
    });
    sessionRef.current = session;
    return () => {
      session.stop();
      sessionRef.current = null;
    };
  }, [active]);

  const { title, artist, muted } = options;
  useEffect(() => {
    sessionRef.current?.update({ ...latest.current, title, artist, muted });
  }, [title, artist, muted]);
}
