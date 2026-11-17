import { hasTranslatableText } from '@lib/translation/segments';
import type { TranslationSupport } from '@lib/translation/types';

export const OUTGOING_TRANSLATION_DEBOUNCE_MS = 400;

export type OutgoingDraftState = {
  status: 'idle' | 'translating' | 'ready' | 'failed';
  source: string;
  translated: string | null;
};

export type OutgoingSendResult = { text: string; translated: boolean };

export interface OutgoingDraftTranslator {
  update(text: string): void;
  resolveForSend(text: string): Promise<OutgoingSendResult>;
  subscribe(listener: (state: OutgoingDraftState) => void): () => void;
  dispose(): void;
}

// The message carries no text (security rule 3).
const DISPOSED_ERROR = 'outgoing-draft-disposed';

export const IDLE_OUTGOING_DRAFT: OutgoingDraftState = { status: 'idle', source: '', translated: null };

/**
 * Keeps an in-memory translation of the composer draft. Only the latest draft counts: results for an older
 * `source` are dropped, and once disposed (unmount, room change) nothing resolves with text any more.
 */
export function createOutgoingDraftTranslator(translate: (text: string) => Promise<string>): OutgoingDraftTranslator {
  let state: OutgoingDraftState = IDLE_OUTGOING_DRAFT;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: { source: string; result: Promise<string | null> } | null = null;
  let disposed = false;
  const listeners = new Set<(state: OutgoingDraftState) => void>();

  const setState = (next: OutgoingDraftState) => {
    state = next;
    for (const listener of [...listeners]) {
      listener(state);
    }
  };

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const start = (source: string): Promise<string | null> => {
    clearTimer();
    if (inFlight?.source === source) {
      return inFlight.result;
    }
    let result: Promise<string | null>;
    try {
      result = translate(source).then(
        (translated) => translated,
        () => null,
      );
    } catch {
      result = Promise.resolve(null);
    }
    const job = { source, result };
    inFlight = job;
    void result.then((translated) => {
      if (inFlight === job) {
        inFlight = null;
      }
      if (disposed || state.source !== source) {
        return;
      }
      setState(translated === null ? { status: 'failed', source, translated: null } : { status: 'ready', source, translated });
    });
    return result;
  };

  return {
    update(text) {
      if (disposed) {
        return;
      }
      if (!hasTranslatableText(text)) {
        clearTimer();
        if (state.status !== 'idle' || state.source !== text) {
          setState({ status: 'idle', source: text, translated: null });
        }
        return;
      }
      if (state.source === text && state.status !== 'idle') {
        return;
      }
      clearTimer();
      setState({ status: 'translating', source: text, translated: null });
      timer = setTimeout(() => {
        timer = undefined;
        if (!disposed) {
          void start(text);
        }
      }, OUTGOING_TRANSLATION_DEBOUNCE_MS);
    },

    async resolveForSend(text) {
      if (disposed) {
        throw new Error(DISPOSED_ERROR);
      }
      if (!hasTranslatableText(text)) {
        return { text, translated: false };
      }
      if (state.status === 'ready' && state.source === text && state.translated !== null) {
        return { text: state.translated, translated: true };
      }
      if (state.source !== text) {
        // The draft moved on (or was never reported): this text becomes the latest one.
        setState({ status: 'translating', source: text, translated: null });
      }
      const translated = await start(text);
      if (disposed) {
        throw new Error(DISPOSED_ERROR);
      }
      return translated === null ? { text, translated: false } : { text: translated, translated: true };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      disposed = true;
      clearTimer();
      inFlight = null;
      listeners.clear();
    },
  };
}

export type OutgoingDraftView = { kind: 'preview'; text: string } | { kind: 'translating' } | { kind: 'failed' } | null;

/** What the strip above the composer shows for the current draft. */
export function describeOutgoingDraft({
  isEnabled,
  support,
  state,
  draft,
}: {
  isEnabled: boolean;
  support: TranslationSupport;
  state: OutgoingDraftState;
  draft: string;
}): OutgoingDraftView {
  const text = draft.trim();
  if (!isEnabled || !hasTranslatableText(text)) {
    return null;
  }
  if (support === 'downloadable' || support === 'downloading') {
    return { kind: 'translating' };
  }
  // A state for an older draft (or before the latest one reached the translator) is never shown as the preview.
  if (state.source !== text || state.status === 'translating') {
    return { kind: 'translating' };
  }
  if (state.status === 'ready' && state.translated !== null) {
    return { kind: 'preview', text: state.translated };
  }
  if (state.status === 'failed') {
    return { kind: 'failed' };
  }
  return null;
}
