import { afterEach, describe, expect, it } from 'vitest';
import { getIncomingSlot, isSlotVisible, releaseIncomingSlot, setIncomingSlot, subscribeIncomingSlot, watchSlotVisibility } from './incoming-slot';

function slot(connected = true, rects = 1): HTMLElement {
  return { isConnected: connected, getClientRects: () => ({ length: rects }) } as unknown as HTMLElement;
}

afterEach(() => {
  setIncomingSlot(null);
});

describe('incoming call slot', () => {
  it('stores the sidebar slot and notifies subscribers only on changes', () => {
    const element = slot();
    let calls = 0;
    const unsubscribe = subscribeIncomingSlot(() => {
      calls += 1;
    });

    setIncomingSlot(element);
    setIncomingSlot(element);
    expect(getIncomingSlot()).toBe(element);
    expect(calls).toBe(1);

    unsubscribe();
    setIncomingSlot(null);
    expect(calls).toBe(1);
  });

  it('only releases the slot that is currently mounted', () => {
    const first = slot();
    const second = slot();
    setIncomingSlot(first);
    setIncomingSlot(second);

    releaseIncomingSlot(first);
    expect(getIncomingSlot()).toBe(second);

    releaseIncomingSlot(second);
    expect(getIncomingSlot()).toBeNull();
  });

  it('falls back to the floating card when the slot is missing, detached or hidden', () => {
    expect(isSlotVisible(null)).toBe(false);
    expect(isSlotVisible(slot(false))).toBe(false);
    expect(isSlotVisible(slot(true, 0))).toBe(false);
    expect(isSlotVisible(slot())).toBe(true);
    const emptyInVisibleList = { ...slot(true, 0), isConnected: true, getClientRects: () => ({ length: 0 }), parentElement: slot() } as unknown as HTMLElement;
    expect(isSlotVisible(emptyInVisibleList)).toBe(true);
  });
});

describe('watchSlotVisibility', () => {
  it('reports the sidebar slot hiding and showing again as the layout changes', () => {
    let rects = 1;
    const parent = { getClientRects: () => ({ length: rects }) };
    const element = { isConnected: true, getClientRects: () => ({ length: 0 }), parentElement: parent } as unknown as HTMLElement;
    let observed: unknown = null;
    let notify: () => void = () => undefined;
    const listeners = new Map<string, () => void>();
    let disconnected = false;
    const changes: boolean[] = [];

    const stop = watchSlotVisibility(element, (visible) => changes.push(visible), {
      createObserver: (callback) => {
        notify = callback;
        return { observe: (target) => void (observed = target), disconnect: () => void (disconnected = true) };
      },
      target: { addEventListener: (type, listener) => void listeners.set(type, listener), removeEventListener: (type) => void listeners.delete(type) },
    });

    expect(observed).toBe(parent);
    rects = 0;
    notify();
    rects = 1;
    listeners.get('resize')?.();
    listeners.get('resize')?.();
    expect(changes).toEqual([true, false, true]);

    stop();
    expect(disconnected).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it('reports hidden without a slot', () => {
    const changes: boolean[] = [];
    watchSlotVisibility(null, (visible) => changes.push(visible), { createObserver: null, target: null })();
    expect(changes).toEqual([false]);
  });
});
