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

interface ObserverLike {
  observe: (target: Element) => void;
  disconnect: () => void;
}

export interface SlotWatchDeps {
  createObserver: ((callback: () => void) => ObserverLike) | null;
  target: { addEventListener: (type: string, listener: () => void) => void; removeEventListener: (type: string, listener: () => void) => void } | null;
}

function defaultWatchDeps(): SlotWatchDeps {
  return {
    createObserver: typeof ResizeObserver === 'undefined' ? null : (callback) => new ResizeObserver(callback),
    target: typeof window === 'undefined' ? null : window,
  };
}

export function watchSlotVisibility(element: HTMLElement | null, onChange: (visible: boolean) => void, deps: SlotWatchDeps = defaultWatchDeps()): () => void {
  let last = isSlotVisible(element);
  onChange(last);
  if (!element) {
    return () => undefined;
  }
  const check = () => {
    const next = isSlotVisible(element);
    if (next !== last) {
      last = next;
      onChange(next);
    }
  };
  const observer = deps.createObserver?.(check) ?? null;
  observer?.observe(element.parentElement ?? element);
  deps.target?.addEventListener('resize', check);
  return () => {
    observer?.disconnect();
    deps.target?.removeEventListener('resize', check);
  };
}
