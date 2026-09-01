import { createNoiseBuffer, getSharedAudioContext, resumeIfSuspended } from './shared-audio-context';

function playCrack(context: AudioContext, startTime: number): void {
  const duration = 0.18;
  const noise = context.createBufferSource();
  noise.buffer = createNoiseBuffer(context, duration);

  const filter = context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 800;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.5, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  noise.start(startTime);
  noise.stop(startTime + duration);
}

function playRumble(context: AudioContext, startTime: number, duration: number): void {
  const noise = context.createBufferSource();
  noise.buffer = createNoiseBuffer(context, duration);

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 140;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.4, startTime + 0.1);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  noise.start(startTime);
  noise.stop(startTime + duration);
}

export function playThunderSound(boltCount = 1): void {
  try {
    const context = getSharedAudioContext();
    resumeIfSuspended(context);

    const now = context.currentTime;
    const count = Math.max(1, boltCount);

    for (let i = 0; i < count; i += 1) {
      const offset = 0.08 + i * 0.42;
      const isLast = i === count - 1;
      playCrack(context, now + offset);
      playRumble(context, now + offset + 0.02, isLast ? 1.1 : 0.8);
    }
  } catch {
    return;
  }
}
