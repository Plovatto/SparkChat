import { useEffect, useRef } from 'react';
import type { AppSocket } from '@lib/socket';
import { currentTimeZone } from '@lib/socket/time-zone';

export function useTimeZoneSync(socket: AppSocket | null, userId: string | undefined): void {
  const reportedRef = useRef<string | undefined>(currentTimeZone());

  useEffect(() => {
    if (!socket || !userId) {
      return;
    }
    const report = () => {
      const timeZone = currentTimeZone();
      if (timeZone && timeZone !== reportedRef.current) {
        reportedRef.current = timeZone;
        socket.emit('user:set-timezone', { timeZone });
      }
    };
    document.addEventListener('visibilitychange', report);
    window.addEventListener('focus', report);
    return () => {
      document.removeEventListener('visibilitychange', report);
      window.removeEventListener('focus', report);
    };
  }, [socket, userId]);
}
