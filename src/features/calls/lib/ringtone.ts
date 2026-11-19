import { getSharedAudioContext, resumeIfSuspended } from '@lib/audio/shared-audio-context';

export type RingPattern = 'incoming' | 'outgoing';

const PERIOD_MS: Record<RingPattern, number> = { incoming: 2000, outgoing: 3000 };

let timer: ReturnType<typeof setInterval> | null = null;

function beep(context: AudioContext, frequency: number, start: number, duration: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.18, start + 0.03);
  gain.gain.setValueAtTime(0.18, start + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function playOnce(pattern: RingPattern): void {
  try {
    const context = getSharedAudioContext();
    resumeIfSuspended(context);
    const now = context.currentTime;
    if (pattern === 'incoming') {
      beep(context, 440, now, 0.4);
      beep(context, 480, now, 0.4);
      beep(context, 440, now + 0.6, 0.4);
      beep(context, 480, now + 0.6, 0.4);
    } else {
      beep(context, 425, now, 1.0);
    }
  } catch {
    return;
  }
}

export function startRingtone(pattern: RingPattern): void {
  stopRingtone();
  playOnce(pattern);
  timer = setInterval(() => playOnce(pattern), PERIOD_MS[pattern]);
}

export function stopRingtone(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
