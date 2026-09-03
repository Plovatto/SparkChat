let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  sharedAudioContext ??= new AudioContext();
  return sharedAudioContext;
}

export function resumeIfSuspended(context: AudioContext): void {
  if (context.state === 'suspended') {
    void context.resume();
  }
}

export function createNoiseBuffer(context: AudioContext, durationSeconds: number): AudioBuffer {
  const bufferSize = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function createBrownNoiseBuffer(context: AudioContext, durationSeconds: number): AudioBuffer {
  const bufferSize = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);

  let lastValue = 0;
  let peak = 0.0001;
  for (let i = 0; i < bufferSize; i += 1) {
    const white = Math.random() * 2 - 1;
    lastValue = (lastValue + white * 0.06) / 1.02;
    data[i] = lastValue;
    peak = Math.max(peak, Math.abs(lastValue));
  }

  const normalize = 0.9 / peak;
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = data[i]! * normalize;
  }

  return buffer;
}
