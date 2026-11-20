import { useEffect, useRef, useState } from 'react';
import {
  advanceLine,
  bumpReaction,
  entranceSchedule,
  initialConversation,
  setPhase,
  type WelcomeBubbleSpec,
  type WelcomeConversationState,
} from '../lib/welcome-script';

export interface WelcomeConversationOptions {
  startMs: number;
  stepMs: number;
  typingMs: number;
  liveEveryMs: number;
  liveTypingMs: number;
}

export const WELCOME_CONVERSATION_TIMING: WelcomeConversationOptions = {
  startMs: 1050,
  stepMs: 340,
  typingMs: 900,
  liveEveryMs: 2400,
  liveTypingMs: 1300,
};

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export function useWelcomeConversation(
  specs: readonly WelcomeBubbleSpec[],
  liveOrder: readonly string[],
  reducedMotion: boolean,
  options: WelcomeConversationOptions = WELCOME_CONVERSATION_TIMING,
): WelcomeConversationState {
  const [state, setState] = useState<WelcomeConversationState>(() => initialConversation(specs, reducedMotion));
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    const later = (ms: number, run: () => void) => {
      timers.push(window.setTimeout(run, ms));
    };
    const specById = new Map(specs.map((spec) => [spec.id, spec]));
    let cursor = 0;

    const liveTick = () => {
      if (isDocumentHidden()) {
        return;
      }
      const id = liveOrder[cursor % liveOrder.length];
      cursor += 1;
      const spec = id ? specById.get(id) : undefined;
      if (!spec) {
        return;
      }
      if (spec.kind === 'reaction') {
        setState(bumpReaction);
        return;
      }
      if (spec.kind === 'incoming' && !reducedMotion) {
        setState((previous) => setPhase(previous, spec.id, 'typing'));
        later(options.liveTypingMs, () => setState((previous) => advanceLine(previous, spec)));
        return;
      }
      setState((previous) => advanceLine(previous, spec));
    };

    let interval: number | undefined;
    const startLive = () => {
      interval = window.setInterval(liveTick, reducedMotion ? options.liveEveryMs * 2 : options.liveEveryMs);
    };

    if (reducedMotion) {
      setState(initialConversation(specs, true));
      startLive();
    } else {
      setState(initialConversation(specs, false));
      const schedule = entranceSchedule(specs, options);
      for (const step of schedule) {
        const spec = specById.get(step.id);
        const firstPhase = spec?.kind === 'incoming' || spec?.kind === 'typing' ? 'typing' : 'shown';
        later(step.appearAt, () => setState((previous) => setPhase(previous, step.id, firstPhase)));
        if (step.revealAt !== step.appearAt) {
          later(step.revealAt, () => setState((previous) => setPhase(previous, step.id, 'shown')));
        }
      }
      const lastReveal = schedule.reduce((max, step) => Math.max(max, step.revealAt), 0);
      later(lastReveal + options.liveEveryMs, startLive);
    }

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      timers.length = 0;
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [specs, liveOrder, reducedMotion, options]);

  return state;
}
