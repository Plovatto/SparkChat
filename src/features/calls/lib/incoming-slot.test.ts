import { afterEach, describe, expect, it } from 'vitest';
import { getIncomingSlot, isSlotVisible, releaseIncomingSlot, setIncomingSlot, subscribeIncomingSlot } from './incoming-slot';

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
