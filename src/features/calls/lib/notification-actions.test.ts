import { describe, expect, it, vi } from 'vitest';
import { queueNotificationCallAction, subscribeNotificationCallActions } from './notification-actions';

describe('notification call actions', () => {
  it('keeps actions until the call controller subscribes, then delivers new ones right away', () => {
    queueNotificationCallAction({ type: 'answer', callId: 'c1' });
    const listener = vi.fn();
    const unsubscribe = subscribeNotificationCallActions(listener);
    expect(listener).toHaveBeenCalledWith({ type: 'answer', callId: 'c1' });

    queueNotificationCallAction({ type: 'decline', callId: 'c2' });
    expect(listener).toHaveBeenLastCalledWith({ type: 'decline', callId: 'c2' });
    unsubscribe();

    queueNotificationCallAction({ type: 'decline', callId: 'c3' });
    expect(listener).toHaveBeenCalledTimes(2);
    const later = vi.fn();
    subscribeNotificationCallActions(later)();
    expect(later).toHaveBeenCalledWith({ type: 'decline', callId: 'c3' });
  });
});
