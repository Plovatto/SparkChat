import { createBrownNoiseBuffer, createNoiseBuffer, getSharedAudioContext, resumeIfSuspended } from '@lib/audio/shared-audio-context';

function playCrack(context: AudioContext, startTime: number, pan: number): void {
  const duration = 0.1;
  const noise = context.createBufferSource();
  noise.buffer = createNoiseBuffer(context, duration);

  const filter = context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1500;
  filter.Q.value = 0.6;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.9, startTime);
  gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

  const panner = context.createStereoPanner();
  panner.pan.value = pan;

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(context.destination);
  noise.start(startTime);
  noise.stop(startTime + duration);
}

function playBoom(
  context: AudioContext,
  startTime: number,
  duration: number,
  startFrequency: number,
  endFrequency: number,
  peakGain: number,
  pan: number,
): void {
  const noise = context.createBufferSource();
  noise.buffer = createBrownNoiseBuffer(context, duration);

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 3.5;
  filter.frequency.setValueAtTime(startFrequency, startTime);
  filter.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);

  const attack = Math.min(0.15, duration * 0.25);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  const panner = context.createStereoPanner();
  panner.pan.value = pan;

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(context.destination);
  noise.start(startTime);
  noise.stop(startTime + duration);
}

function playRumble(context: AudioContext, startTime: number, totalDuration: number): void {
  const burstCount = 3 + Math.floor(Math.random() * 3);
  let cursor = 0;

  for (let i = 0; i < burstCount; i += 1) {
    const isFirst = i === 0;
    const remaining = totalDuration - cursor;
    const burstDuration = isFirst
      ? Math.min(0.5, remaining)
      : Math.max(0.35, remaining / (burstCount - i)) * (0.7 + Math.random() * 0.6);

    const startFrequency = isFirst ? 300 + Math.random() * 150 : 140 + Math.random() * 120;
    const endFrequency = 35 + Math.random() * 35;
    const peakGain = (isFirst ? 0.55 : 0.3) * (0.75 + Math.random() * 0.5);
    const pan = (Math.random() - 0.5) * 0.8;

    playBoom(context, startTime + cursor, burstDuration, startFrequency, endFrequency, peakGain, pan);

    cursor += burstDuration * (0.45 + Math.random() * 0.25);
    if (cursor >= totalDuration) {
      break;
    }
  }
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
      const pan = (Math.random() - 0.5) * 0.6;
      playCrack(context, now + offset, pan);
      playRumble(context, now + offset + 0.03, isLast ? 2.2 : 1.1);
    }
  } catch {
    return;
  }
}
