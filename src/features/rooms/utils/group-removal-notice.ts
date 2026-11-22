export interface GroupRemovalNotice {
  roomName: string;
}

let current: GroupRemovalNotice | null = null;
const listeners = new Set<() => void>();

function publish(next: GroupRemovalNotice | null): void {
  current = next;
  listeners.forEach((listener) => listener());
}

export function showGroupRemovalNotice(roomName: string): void {
  publish({ roomName });
}

export function dismissGroupRemovalNotice(): void {
  if (current) {
    publish(null);
  }
}

export function getGroupRemovalNotice(): GroupRemovalNotice | null {
  return current;
}

export function subscribeGroupRemovalNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
