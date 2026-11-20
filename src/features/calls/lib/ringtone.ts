import { getSharedAudioContext, resumeIfSuspended } from '@lib/audio/shared-audio-context';

export type RingPattern = 'incoming' | 'outgoing';

export interface RingNote {
  offset: number;
  frequency: number;
  duration: number;
  peak: number;
}

export interface RingPartial {
  ratio: number;
  level: number;
  decay: number;
}

export const RING_PERIOD_MS: Record<RingPattern, number> = { incoming: 2200, outgoing: 3200 };

const RING_NOTES: Record<RingPattern, readonly RingNote[]> = {
  incoming: [
    { offset: 0, frequency: 659.25, duration: 0.9, peak: 0.16 },
    { offset: 0.16, frequency: 987.77, duration: 0.9, peak: 0.13 },
    { offset: 0.32, frequency: 830.61, duration: 1.2, peak: 0.14 },
  ],
  outgoing: [
    { offset: 0, frequency: 523.25, duration: 0.7, peak: 0.07 },
    { offset: 0.24, frequency: 659.25, duration: 0.9, peak: 0.06 },
  ],
};

export const RING_PARTIALS: readonly RingPartial[] = [
  { ratio: 1, level: 1, decay: 1 },
  { ratio: 2, level: 0.18, decay: 0.6 },
  { ratio: 4, level: 0.06, decay: 0.3 },
];

const ATTACK_S = 0.012;
const FLOOR = 0.0001;
const RELEASE_S = 0.08;

export function ringNotes(pattern: RingPattern): readonly RingNote[] {
  return RING_NOTES[pattern];
}

export function ringLength(pattern: RingPattern): number {
  return Math.max(...RING_NOTES[pattern].map((note) => note.offset + note.duration));
}

interface RingSession {
  context: AudioContext;
  master: GainNode;
  oscillators: Set<OscillatorNode>;
  timer: ReturnType<typeof setInterval> | null;
}

let session: RingSession | null = null;

function voice(current: RingSession, note: RingNote, start: number): void {
  const { context, master, oscillators } = current;
  for (const partial of RING_PARTIALS) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const peak = note.peak * partial.level;
    const end = start + note.duration * partial.decay;
    oscillator.type = 'sine';
    oscillator.frequency.value = note.frequency * partial.ratio;
    gain.gain.setValueAtTime(FLOOR, start);
    gain.gain.linearRampToValueAtTime(peak, start + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(FLOOR, end);
    oscillator.connect(gain);
    gain.connect(master);
    oscillators.add(oscillator);
    oscillator.onended = () => {
      oscillators.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}

function playOnce(current: RingSession, pattern: RingPattern): void {
  try {
    resumeIfSuspended(current.context);
    const now = current.context.currentTime + 0.02;
    for (const note of RING_NOTES[pattern]) {
      voice(current, note, now + note.offset);
    }
  } catch {
    return;
  }
}

export function startRingtone(pattern: RingPattern): void {
  stopRingtone();
  let context: AudioContext;
  try {
    context = getSharedAudioContext();
  } catch {
    return;
  }
  const master = context.createGain();
  master.gain.setValueAtTime(1, context.currentTime);
  master.connect(context.destination);
  const current: RingSession = { context, master, oscillators: new Set(), timer: null };
  session = current;
  playOnce(current, pattern);
  current.timer = setInterval(() => playOnce(current, pattern), RING_PERIOD_MS[pattern]);
}

export function stopRingtone(): void {
  const current = session;
  if (!current) {
    return;
  }
  session = null;
  if (current.timer !== null) {
    clearInterval(current.timer);
  }
  try {
    const now = current.context.currentTime;
    const level = current.master.gain;
    level.cancelScheduledValues(now);
    level.setValueAtTime(level.value, now);
    level.linearRampToValueAtTime(0, now + RELEASE_S);
    for (const oscillator of current.oscillators) {
      oscillator.stop(now + RELEASE_S + 0.02);
    }
    setTimeout(() => current.master.disconnect(), (RELEASE_S + 0.1) * 1000);
  } catch {
    return;
  }
}
