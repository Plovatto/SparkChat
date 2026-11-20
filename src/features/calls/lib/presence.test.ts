import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Presence, isMounted, type PresenceStage } from './presence';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function track(open: boolean) {
  const stages: PresenceStage[] = [];
  const presence = new Presence(open, 200, 160, (stage) => stages.push(stage));
  return { presence, stages };
}

describe('Presence', () => {
  it('enters, then settles open after the enter duration', () => {
    const { presence, stages } = track(false);
    presence.setOpen(true);
    expect(presence.current).toBe('entering');
    vi.advanceTimersByTime(199);
    expect(presence.current).toBe('entering');
    vi.advanceTimersByTime(1);
    expect(stages).toEqual(['entering', 'open']);
  });

  it('stays mounted while exiting and unmounts only after the exit finishes', () => {
    const { presence, stages } = track(true);
    presence.setOpen(false);
    expect(isMounted(presence.current)).toBe(true);
    vi.advanceTimersByTime(159);
    expect(isMounted(presence.current)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isMounted(presence.current)).toBe(false);
    expect(stages).toEqual(['exiting', 'closed']);
  });

  it('reverses an exit that is interrupted by reopening, without a late close', () => {
    const { presence, stages } = track(true);
    presence.setOpen(false);
    vi.advanceTimersByTime(80);
    presence.setOpen(true);
    vi.advanceTimersByTime(500);
    expect(presence.current).toBe('open');
    expect(stages).toEqual(['exiting', 'entering', 'open']);
  });

  it('ignores repeated requests for the same state', () => {
    const { presence, stages } = track(false);
    presence.setOpen(false);
    presence.setOpen(true);
    presence.setOpen(true);
    vi.advanceTimersByTime(200);
    expect(stages).toEqual(['entering', 'open']);
  });

  it('switches instantly with reduced motion and cancels timers on dispose', () => {
    const { presence, stages } = track(true);
    presence.setOpen(false, true);
    expect(stages).toEqual(['closed']);

    presence.setOpen(true);
    presence.dispose();
    vi.advanceTimersByTime(500);
    expect(presence.current).toBe('entering');
  });
});
