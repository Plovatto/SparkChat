import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTENTION_IDLE_MS, createAttentionTracker, isAttentive } from './attention-tracker';

describe('isAttentive', () => {
  it('requires visibility, focus and recent interaction', () => {
    expect(isAttentive({ visible: true, focused: true, idleMs: 0 })).toBe(true);
    expect(isAttentive({ visible: true, focused: true, idleMs: ATTENTION_IDLE_MS })).toBe(true);
    expect(isAttentive({ visible: true, focused: true, idleMs: ATTENTION_IDLE_MS + 1 })).toBe(false);
    expect(isAttentive({ visible: true, focused: false, idleMs: 0 })).toBe(false);
    expect(isAttentive({ visible: false, focused: true, idleMs: 0 })).toBe(false);
  });
});

describe('createAttentionTracker', () => {
  let nowMs = 0;
  let visible = true;
  let focused = true;
  const onChange = vi.fn();

  const build = () =>
    createAttentionTracker({
      now: () => nowMs,
      isVisible: () => visible,
      hasFocus: () => focused,
      onChange,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    nowMs = 0;
    visible = true;
    focused = true;
    onChange.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const advance = (ms: number) => {
    nowMs += ms;
    vi.advanceTimersByTime(ms);
  };

  it('reports the current pair and starts attentive', () => {
    const tracker = build();
    expect(tracker.report()).toEqual({ visible: true, attentive: true });
    tracker.dispose();
  });

  it('emits once when the idle timeout is reached', () => {
    const tracker = build();
    tracker.report();
    advance(ATTENTION_IDLE_MS - 1);
    expect(onChange).not.toHaveBeenCalled();
    advance(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ visible: true, attentive: false });
    advance(ATTENTION_IDLE_MS * 3);
    expect(onChange).toHaveBeenCalledTimes(1);
    tracker.dispose();
  });

  it('does not emit for interactions while attentive and pushes the idle deadline', () => {
    const tracker = build();
    tracker.report();
    advance(30_000);
    tracker.interact();
    tracker.interact();
    expect(onChange).not.toHaveBeenCalled();
    advance(ATTENTION_IDLE_MS - 1);
    expect(onChange).not.toHaveBeenCalled();
    advance(2);
    expect(onChange).toHaveBeenCalledWith({ visible: true, attentive: false });
    tracker.dispose();
  });

  it('emits when an interaction ends the idle state', () => {
    const tracker = build();
    tracker.report();
    advance(ATTENTION_IDLE_MS + 1);
    onChange.mockReset();
    tracker.interact();
    tracker.interact();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ visible: true, attentive: true });
    tracker.dispose();
  });

  it('emits on focus changes and dedupes repeats', () => {
    const tracker = build();
    tracker.report();
    focused = false;
    tracker.refresh();
    tracker.refresh();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ visible: true, attentive: false });
    focused = true;
    tracker.interact();
    expect(onChange).toHaveBeenLastCalledWith({ visible: true, attentive: true });
    tracker.dispose();
  });

  it('treats a report as the baseline so refresh stays quiet when nothing changed', () => {
    const tracker = build();
    visible = false;
    tracker.report();
    tracker.refresh();
    expect(onChange).not.toHaveBeenCalled();
    tracker.dispose();
  });

  it('stops the timer on dispose', () => {
    const tracker = build();
    tracker.report();
    tracker.dispose();
    advance(ATTENTION_IDLE_MS * 2);
    expect(onChange).not.toHaveBeenCalled();
  });
});
