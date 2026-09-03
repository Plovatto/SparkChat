import { useEffect, useRef, useState } from 'react';
import { checkNicknameAvailability } from '../api/auth-api';

export type NicknameCheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const DEBOUNCE_MS = 500;

export function useNicknameAvailability(nickname: string, skip = false): NicknameCheckState {
  const [status, setStatus] = useState<NicknameCheckState>('idle');
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = nickname.trim();

    if (skip || !trimmed) {
      requestIdRef.current += 1;
      setStatus('idle');
      return;
    }

    setStatus('checking');
    const requestId = (requestIdRef.current += 1);

    const timer = setTimeout(() => {
      checkNicknameAvailability(trimmed)
        .then((result) => {
          if (requestIdRef.current === requestId) {
            setStatus(result);
          }
        })
        .catch(() => {
          if (requestIdRef.current === requestId) {
            setStatus('idle');
          }
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [nickname, skip]);

  return status;
}
