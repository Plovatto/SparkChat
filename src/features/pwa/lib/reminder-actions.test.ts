import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_QUEUED_REMINDER_ACTIONS, queueReminderAction, REMINDER_ACTION_TTL_MS, subscribeReminderActions } from './reminder-actions';

function drain() {
  const received = vi.fn();
  subscribeReminderActions(received)();
  return received;
}

afterEach(() => {
  vi.useRealTimers();
  drain();
});

describe('reminder action queue', () => {
  it('delivers queued actions on subscribe, stamped with the queue time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    queueReminderAction({ reminderId: 'a', roomId: 'r', action: 'done' });
    const received = drain();
    expect(received).toHaveBeenCalledWith({ reminderId: 'a', roomId: 'r', action: 'done', queuedAt: 1000 });
  });

  it('drops actions older than the TTL measured from queue time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    queueReminderAction({ reminderId: 'a', roomId: 'r', action: 'done' });
    vi.setSystemTime(1000 + REMINDER_ACTION_TTL_MS);
    expect(drain()).not.toHaveBeenCalled();
  });

  it('keeps only the newest actions on overflow', () => {
    for (let index = 0; index < MAX_QUEUED_REMINDER_ACTIONS + 2; index += 1) {
      queueReminderAction({ reminderId: `r${index}`, roomId: 'r', action: 'done' });
    }
    const received = drain();
    expect(received).toHaveBeenCalledTimes(MAX_QUEUED_REMINDER_ACTIONS);
    expect(received.mock.calls[0]?.[0].reminderId).toBe('r2');
  });
});
