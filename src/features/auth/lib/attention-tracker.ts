export const ATTENTION_IDLE_MS = 60_000;
export const ATTENTION_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'] as const;

export interface AttentionState {
  visible: boolean;
  attentive: boolean;
}

export function isAttentive({ visible, focused, idleMs }: { visible: boolean; focused: boolean; idleMs: number }): boolean {
  return visible && focused && idleMs <= ATTENTION_IDLE_MS;
}

export interface AttentionTracker {
  report: () => AttentionState;
  refresh: () => void;
  interact: () => void;
  dispose: () => void;
}

interface AttentionTrackerOptions {
  now: () => number;
  isVisible: () => boolean;
  hasFocus: () => boolean;
  onChange: (state: AttentionState) => void;
}

export function createAttentionTracker({ now, isVisible, hasFocus, onChange }: AttentionTrackerOptions): AttentionTracker {
  let lastInteractionAt = now();
  let last: AttentionState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const compute = (): AttentionState => {
    const visible = isVisible();
    return { visible, attentive: isAttentive({ visible, focused: hasFocus(), idleMs: now() - lastInteractionAt }) };
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const arm = () => {
    clearTimer();
    if (!last?.attentive) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      refresh();
    }, Math.max(0, ATTENTION_IDLE_MS - (now() - lastInteractionAt)) + 1);
  };

  const refresh = () => {
    const next = compute();
    const changed = !last || last.visible !== next.visible || last.attentive !== next.attentive;
    last = next;
    arm();
    if (changed) {
      onChange(next);
    }
  };

  return {
    report: () => {
      last = compute();
      arm();
      return last;
    },
    refresh,
    interact: () => {
      lastInteractionAt = now();
      if (!last?.attentive) {
        refresh();
      }
    },
    dispose: clearTimer,
  };
}
