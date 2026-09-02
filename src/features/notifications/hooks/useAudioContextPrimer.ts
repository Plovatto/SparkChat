import { useEffect } from 'react';
import { primeNotificationSound } from '../utils/play-notification-sound';

export function useAudioContextPrimer(): void {
  useEffect(() => {
    const prime = () => {
      primeNotificationSound();
      window.removeEventListener('pointerdown', prime);
      window.removeEventListener('keydown', prime);
    };

    window.addEventListener('pointerdown', prime);
    window.addEventListener('keydown', prime);

    return () => {
      window.removeEventListener('pointerdown', prime);
      window.removeEventListener('keydown', prime);
    };
  }, []);
}
