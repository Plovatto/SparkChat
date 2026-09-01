let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  sharedAudioContext ??= new AudioContext();
  return sharedAudioContext;
}

function playTone(context: AudioContext, frequency: number, startTime: number, duration: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

export function playCelebrationSound(): void {
  try {
    const context = getAudioContext();
    if (context.state === 'suspended') {
      void context.resume();
    }

    const now = context.currentTime;
    playTone(context, 523.25, now, 0.12);
    playTone(context, 659.25, now + 0.1, 0.12);
    playTone(context, 783.99, now + 0.2, 0.12);
    playTone(context, 1046.5, now + 0.3, 0.3);
  } catch {
    return;
  }
}
