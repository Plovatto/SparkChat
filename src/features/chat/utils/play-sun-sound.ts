import { getSharedAudioContext, resumeIfSuspended } from './shared-audio-context';

function playTone(context: AudioContext, frequency: number, startTime: number, duration: number, peakGain: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

export function playSunSound(): void {
  try {
    const context = getSharedAudioContext();
    resumeIfSuspended(context);

    const now = context.currentTime;
    playTone(context, 392.0, now, 0.9, 0.14);
    playTone(context, 493.88, now + 0.18, 0.9, 0.14);
    playTone(context, 587.33, now + 0.36, 1.1, 0.14);
    playTone(context, 783.99, now + 0.54, 1.3, 0.16);
  } catch {
    return;
  }
}
