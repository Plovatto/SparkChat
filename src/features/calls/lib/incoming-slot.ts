type Listener = () => void;

let current: HTMLElement | null = null;
const listeners = new Set<Listener>();

export function setIncomingSlot(element: HTMLElement | null): void {
  if (current === element) {
    return;
  }
  current = element;
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

export function releaseIncomingSlot(element: HTMLElement): void {
  if (current === element) {
    setIncomingSlot(null);
  }
}

export function getIncomingSlot(): HTMLElement | null {
  return current;
}

export function subscribeIncomingSlot(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isSlotVisible(element: HTMLElement | null): element is HTMLElement {
  return element !== null && element.isConnected && (element.parentElement ?? element).getClientRects().length > 0;
}
