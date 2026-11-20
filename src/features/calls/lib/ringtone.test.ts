import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeParam {
  value = 0;
  events: Array<[string, number, number]> = [];
  setValueAtTime(value: number, time: number) {
    this.value = value;
    this.events.push(['set', value, time]);
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push(['linear', value, time]);
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.events.push(['exp', value, time]);
  }
  cancelScheduledValues(time: number) {
    this.events.push(['cancel', 0, time]);
  }
}

class FakeNode {
  connect() {
    return undefined;
  }
  disconnect() {
    return undefined;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  starts: number[] = [];
  stops: number[] = [];
  onended: (() => void) | null = null;
  start(time: number) {
    this.starts.push(time);
  }
  stop(time: number) {
    this.stops.push(time);
  }
}

const fake = {
  currentTime: 10,
  state: 'running',
  destination: new FakeNode(),
  oscillators: [] as FakeOscillator[],
  gains: [] as FakeGain[],
  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  },
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  },
};

vi.mock('@lib/audio/shared-audio-context', () => ({
  getSharedAudioContext: () => fake,
  resumeIfSuspended: () => undefined,
}));

const { RING_PARTIALS, RING_PERIOD_MS, ringLength, ringNotes, startRingtone, stopRingtone } = await import('./ringtone');

describe('ring schedule', () => {
  it('plays a short arpeggio with a pause before the next repeat', () => {
    expect(ringNotes('incoming')).toHaveLength(3);
    expect(ringLength('incoming') * 1000).toBeLessThan(RING_PERIOD_MS.incoming - 400);
    expect(ringLength('outgoing') * 1000).toBeLessThan(RING_PERIOD_MS.outgoing - 400);
  });

  it('keeps notes ordered, audible and moderate', () => {
    for (const pattern of ['incoming', 'outgoing'] as const) {
      const notes = ringNotes(pattern);
      notes.forEach((note, index) => {
        expect(note.peak).toBeGreaterThan(0);
        expect(note.peak).toBeLessThanOrEqual(0.2);
        expect(note.offset).toBeGreaterThanOrEqual(index === 0 ? 0 : (notes[index - 1]?.offset ?? 0));
      });
    }
  });

  it('makes the outgoing tone softer than the incoming one', () => {
    const loudest = (pattern: 'incoming' | 'outgoing') => Math.max(...ringNotes(pattern).map((note) => note.peak));
    expect(loudest('outgoing')).toBeLessThan(loudest('incoming'));
  });
});

describe('startRingtone and stopRingtone', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.oscillators = [];
    fake.gains = [];
  });

  afterEach(() => {
    stopRingtone();
    vi.useRealTimers();
  });

  it('schedules every note with all partials and repeats on the period', () => {
    startRingtone('incoming');
    const perRing = ringNotes('incoming').length * RING_PARTIALS.length;
    expect(fake.oscillators).toHaveLength(perRing);
    vi.advanceTimersByTime(RING_PERIOD_MS.incoming);
    expect(fake.oscillators).toHaveLength(perRing * 2);
  });

  it('shapes each voice with a soft attack and an exponential decay', () => {
    startRingtone('incoming');
    const voice = fake.gains[1];
    expect(voice?.gain.events.map(([kind]) => kind)).toEqual(['set', 'linear', 'exp']);
  });

  it('fades the master gain out and stops repeating when stopped', () => {
    startRingtone('outgoing');
    const master = fake.gains[0];
    const count = fake.oscillators.length;
    stopRingtone();
    expect(master?.gain.events.at(-1)?.[0]).toBe('linear');
    expect(master?.gain.events.at(-1)?.[1]).toBe(0);
    expect(fake.oscillators.every((oscillator) => oscillator.stops.length === 2)).toBe(true);
    vi.advanceTimersByTime(RING_PERIOD_MS.outgoing * 2);
    expect(fake.oscillators).toHaveLength(count);
  });

  it('replaces a running ringtone instead of layering', () => {
    startRingtone('outgoing');
    const firstMaster = fake.gains[0];
    startRingtone('incoming');
    expect(firstMaster?.gain.events.at(-1)?.[1]).toBe(0);
  });
});
