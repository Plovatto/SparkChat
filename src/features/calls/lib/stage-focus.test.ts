import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_HIDE_MS, OverlayVisibility, availableItems, resolveFocus, stripItems } from './stage-focus';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const all = { stream: true, self: true, myScreen: true };

describe('stage focus', () => {
  it('lists the stream first, then the other person, my camera and my screen', () => {
    expect(availableItems(all)).toEqual(['stream', 'remote', 'self', 'my-screen']);
    expect(availableItems({ stream: true, self: false, myScreen: false })).toEqual(['stream', 'remote']);
  });

  it('keeps a focused tile on the stage and puts the rest in the strip', () => {
    expect(resolveFocus('remote', all)).toBe('remote');
    expect(stripItems('remote', all)).toEqual(['stream', 'self', 'my-screen']);
    expect(stripItems('stream', all)).toEqual(['remote', 'self', 'my-screen']);
  });

  it('falls back to the stream when the focused tile disappears', () => {
    expect(resolveFocus('self', { stream: true, self: false, myScreen: false })).toBe('stream');
    expect(stripItems('self', { stream: true, self: false, myScreen: false })).toEqual(['remote']);
  });

  it('falls back to the other person when there is no stream', () => {
    expect(resolveFocus('stream', { stream: false, self: true, myScreen: false })).toBe('remote');
  });
});

describe('overlay visibility', () => {
  function overlay() {
    const changes: boolean[] = [];
    const visibility = new OverlayVisibility((visible) => changes.push(visible));
    return { visibility, changes };
  }

  it('shows on activity and hides after 2.5 s without activity', () => {
    const { visibility, changes } = overlay();
    visibility.activity();
    vi.advanceTimersByTime(OVERLAY_HIDE_MS - 1);
    visibility.activity();
    vi.advanceTimersByTime(OVERLAY_HIDE_MS - 1);
    expect(visibility.isVisible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(visibility.isVisible).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('stays open while the pointer is over the controls and resumes the timer after', () => {
    const { visibility } = overlay();
    visibility.activity();
    visibility.holdOpen(true);
    vi.advanceTimersByTime(OVERLAY_HIDE_MS * 3);
    expect(visibility.isVisible).toBe(true);
    visibility.holdOpen(false);
    vi.advanceTimersByTime(OVERLAY_HIDE_MS);
    expect(visibility.isVisible).toBe(false);
  });

  it('toggles on tap and cancels timers on dispose', () => {
    const { visibility, changes } = overlay();
    visibility.toggle();
    visibility.toggle();
    expect(changes).toEqual([true, false]);
    visibility.toggle();
    visibility.dispose();
    vi.advanceTimersByTime(OVERLAY_HIDE_MS * 2);
    expect(visibility.isVisible).toBe(true);
  });
});
