import { useEffect, useRef, useState } from 'react';
import { Presence, prefersReducedMotion, type PresenceStage } from '../lib/presence';

export function usePresence(open: boolean, enterMs: number, exitMs: number): PresenceStage {
  const [stage, setStage] = useState<PresenceStage>(open ? 'open' : 'closed');
  const presenceRef = useRef<Presence | null>(null);
  presenceRef.current ??= new Presence(open, enterMs, exitMs, setStage);

  useEffect(() => {
    presenceRef.current?.setOpen(open, prefersReducedMotion());
  }, [open]);

  useEffect(() => () => presenceRef.current?.dispose(), []);

  return stage;
}
