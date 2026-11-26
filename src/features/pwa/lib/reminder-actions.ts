import type { ReminderActionChoice } from '../sw/protocol';

export interface ReminderAction {
  reminderId: string;
  roomId: string;
  action: ReminderActionChoice;
}

export interface QueuedReminderAction extends ReminderAction {
  queuedAt: number;
}

type Listener = (action: QueuedReminderAction) => void;

export const REMINDER_ACTION_TTL_MS = 30000;
export const MAX_QUEUED_REMINDER_ACTIONS = 4;
const queued: QueuedReminderAction[] = [];
const listeners = new Set<Listener>();

export function queueReminderAction(action: ReminderAction): void {
  const stamped = { ...action, queuedAt: Date.now() };
  if (listeners.size > 0) {
    for (const listener of Array.from(listeners)) {
      listener(stamped);
    }
    return;
  }
  queued.push(stamped);
  if (queued.length > MAX_QUEUED_REMINDER_ACTIONS) {
    queued.shift();
  }
}

export function subscribeReminderActions(listener: Listener): () => void {
  listeners.add(listener);
  const now = Date.now();
  for (const action of queued.splice(0)) {
    if (now - action.queuedAt < REMINDER_ACTION_TTL_MS) {
      listener(action);
    }
  }
  return () => {
    listeners.delete(listener);
  };
}
