let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  sharedAudioContext ??= new AudioContext();
  return sharedAudioContext;
}

function playTone(context: AudioContext, frequency: number, startTime: number, duration: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

function scheduleNotificationTones(context: AudioContext): void {
  const now = context.currentTime;
  playTone(context, 880, now, 0.14);
  playTone(context, 1108.73, now + 0.09, 0.18);
}

export function primeNotificationSound(): void {
  try {
    const context = getAudioContext();
    if (context.state === 'suspended') {
      void context.resume();
    }
  } catch {
    return;
  }
}

export function playNotificationSound(): void {
  try {
    const context = getAudioContext();
    if (context.state === 'suspended') {
      context
        .resume()
        .then(() => scheduleNotificationTones(context))
        .catch(() => undefined);
      return;
    }

    scheduleNotificationTones(context);
  } catch {
    return;
  }
}
