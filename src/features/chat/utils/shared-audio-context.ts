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
