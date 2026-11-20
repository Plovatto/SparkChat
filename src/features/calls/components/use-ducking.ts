import { useEffect, useRef, useState } from 'react';
import { Ducker } from '../lib/ducking';

export function useDuckedVolume(enabled: boolean, speaking: boolean, base: number): number {
  const [level, setLevel] = useState(1);
  const duckerRef = useRef<Ducker | null>(null);
  duckerRef.current ??= new Ducker(setLevel);

  useEffect(() => {
    duckerRef.current?.update(enabled, speaking);
  }, [enabled, speaking]);

  useEffect(() => () => duckerRef.current?.dispose(), []);

  return Math.max(0, Math.min(1, base * level));
}
