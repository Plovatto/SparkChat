import type { NotificationCallAction } from './call-controller';

type Listener = (action: NotificationCallAction) => void;

const MAX_QUEUED = 4;
const queued: NotificationCallAction[] = [];
const listeners = new Set<Listener>();

export function queueNotificationCallAction(action: NotificationCallAction): void {
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

export function subscribeNotificationCallActions(listener: Listener): () => void {
  listeners.add(listener);
  for (const action of queued.splice(0)) {
    listener(action);
  }
  return () => {
    listeners.delete(listener);
  };
}
