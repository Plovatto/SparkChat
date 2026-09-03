import { createNoiseBuffer, getSharedAudioContext, resumeIfSuspended } from './shared-audio-context';

function playPop(context: AudioContext, startTime: number): void {
  const duration = 0.07;
  const noise = context.createBufferSource();
  noise.buffer = createNoiseBuffer(context, duration);

  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200;
  filter.Q.value = 1.2;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.7, startTime);
  gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  noise.start(startTime);
  noise.stop(startTime + duration);
}

function playChime(context: AudioContext, frequency: number, startTime: number, duration: number, peakGain: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  const panner = context.createStereoPanner();
  panner.pan.value = (Math.random() - 0.5) * 1.2;

  oscillator.connect(gain);
  gain.connect(panner);
  panner.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

function playSparkles(context: AudioContext, startTime: number): void {
  const sparkleCount = 14;
  const pitches = [1318.5, 1567.98, 1760, 1975.5, 2093, 2349.3, 2637.02];

  for (let i = 0; i < sparkleCount; i += 1) {
    const delay = Math.random() * 0.9;
    const frequency = pitches[Math.floor(Math.random() * pitches.length)] ?? 1760;
    playChime(context, frequency, startTime + delay, 0.18 + Math.random() * 0.1, 0.06 + Math.random() * 0.05);
  }
}

export function playCelebrationSound(): void {
  try {
    const context = getSharedAudioContext();
    resumeIfSuspended(context);

    const now = context.currentTime;

    playPop(context, now);
    playChime(context, 523.25, now, 0.12, 0.22);
    playChime(context, 659.25, now + 0.1, 0.12, 0.22);
    playChime(context, 783.99, now + 0.2, 0.12, 0.22);
    playChime(context, 1046.5, now + 0.3, 0.35, 0.24);
    playSparkles(context, now + 0.05);
  } catch {
    return;
  }
}
