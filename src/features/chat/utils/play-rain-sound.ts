import { createNoiseBuffer, getSharedAudioContext, resumeIfSuspended } from './shared-audio-context';

export function playRainSound(): void {
  try {
    const context = getSharedAudioContext();
    resumeIfSuspended(context);

    const duration = 2.6;
    const noise = context.createBufferSource();
    noise.buffer = createNoiseBuffer(context, duration);

    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2200;

    const gain = context.createGain();
    const now = context.currentTime;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.35);
    gain.gain.setValueAtTime(0.14, now + duration - 0.5);
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
