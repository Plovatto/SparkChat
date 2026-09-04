import { createNoiseBuffer, getSharedAudioContext, resumeIfSuspended } from '@lib/audio/shared-audio-context';

export function playWindSound(): void {
  try {
    const context = getSharedAudioContext();
    resumeIfSuspended(context);

    const duration = 1.8;
    const noise = context.createBufferSource();
    noise.buffer = createNoiseBuffer(context, duration);

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;

    const gain = context.createGain();
    const now = context.currentTime;

    filter.frequency.setValueAtTime(300, now);
    filter.frequency.linearRampToValueAtTime(1200, now + duration * 0.5);
    filter.frequency.linearRampToValueAtTime(250, now + duration);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.35, now + duration * 0.3);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);

    noise.start(now);
    noise.stop(now + duration);
  } catch {
    return;
  }
}
