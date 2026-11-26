import type { ReminderActionChoice } from '../sw/protocol';

export interface ReminderAction {
  reminderId: string;
  roomId: string;
  action: ReminderActionChoice;
}

type Listener = (action: ReminderAction) => void;

const MAX_QUEUED = 4;
const queued: ReminderAction[] = [];
const listeners = new Set<Listener>();

export function queueReminderAction(action: ReminderAction): void {
  if (listeners.size > 0) {
    for (const listener of Array.from(listeners)) {
      listener(action);
    }
    return;
  }
  queued.push(action);
  if (queued.length > MAX_QUEUED) {
    queued.shift();
  }
}

export function subscribeReminderActions(listener: Listener): () => void {
  listeners.add(listener);
  for (const action of queued.splice(0)) {
    listener(action);
  }
  return () => {
    listeners.delete(listener);
  };
}
