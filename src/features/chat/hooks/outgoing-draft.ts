import { hasTranslatableText } from '@lib/translation/segments';
import type { TranslationSupport } from '@lib/translation/types';

export const OUTGOING_TRANSLATION_DEBOUNCE_MS = 400;

export const OUTGOING_SEND_TIMEOUT_MS = 10_000;

export type OutgoingDraftState = {
  status: 'idle' | 'translating' | 'ready' | 'failed' | 'timedOut';
  source: string;
  translated: string | null;
};

export type OutgoingSendResult = { text: string; translated: boolean };

export interface OutgoingDraftTranslator {
  update(text: string): void;
  resolveForSend(text: string): Promise<OutgoingSendResult>;
  subscribe(listener: (state: OutgoingDraftState) => void): () => void;
  retryFailed(): void;
  cancelPendingSends(): void;
  dispose(): void;
}

const DISPOSED_ERROR = 'outgoing-draft-disposed';
const TIMEOUT_ERROR = 'outgoing-send-timeout';
const CANCELLED_ERROR = 'outgoing-send-cancelled';
const FAILED_ERROR = 'outgoing-translate-failed';

export const IDLE_OUTGOING_DRAFT: OutgoingDraftState = { status: 'idle', source: '', translated: null };

export function createOutgoingDraftTranslator(translate: (text: string) => Promise<string>): OutgoingDraftTranslator {
  let state: OutgoingDraftState = IDLE_OUTGOING_DRAFT;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: { source: string; result: Promise<string | null> } | null = null;
  let disposed = false;
  const listeners = new Set<(state: OutgoingDraftState) => void>();
  const pendingSends = new Set<(code: string) => void>();

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

  const waitForSend = (result: Promise<string | null>, source: string): Promise<string | null> =>
    new Promise<string | null>((resolve, reject) => {
      const finish = () => {
        clearTimeout(sendTimer);
        pendingSends.delete(cancel);
      };
      const cancel = (code: string) => {
        finish();
        reject(new Error(code));
      };
      const sendTimer = setTimeout(() => {
        if (!disposed && state.source === source && state.status !== 'ready') {
          setState({ status: 'timedOut', source, translated: null });
        }
        cancel(TIMEOUT_ERROR);
      }, OUTGOING_SEND_TIMEOUT_MS);
      pendingSends.add(cancel);
      void result.then((translated) => {
        finish();
        resolve(translated);
      });
    });

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
      if (state.status === 'failed' && state.source === text) {
        return { text, translated: false };
      }
      if (state.source !== text) {
        setState({ status: 'translating', source: text, translated: null });
      }
      const translated = await waitForSend(start(text), text);
      if (disposed) {
        throw new Error(DISPOSED_ERROR);
      }
      if (translated === null) {
        throw new Error(FAILED_ERROR);
      }
      return { text: translated, translated: true };
    },

    retryFailed() {
      if (disposed || state.status !== 'failed' || !hasTranslatableText(state.source)) {
        return;
      }
      const { source } = state;
      setState({ status: 'translating', source, translated: null });
      void start(source);
    },

    cancelPendingSends() {
      for (const cancel of [...pendingSends]) {
        cancel(CANCELLED_ERROR);
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      disposed = true;
      for (const cancel of [...pendingSends]) {
        cancel(DISPOSED_ERROR);
      }
      clearTimer();
      inFlight = null;
      listeners.clear();
    },
  };
}

export type OutgoingDraftView =
  | { kind: 'preview'; text: string }
  | { kind: 'translating' }
  | { kind: 'failed' }
  | { kind: 'timedOut' }
  | null;

export function describeOutgoingDraft({
  isRequested,
  isEnabled,
  support,
  state,
  draft,
}: {
  isRequested: boolean;
  isEnabled: boolean;
  support: TranslationSupport;
  state: OutgoingDraftState;
  draft: string;
}): OutgoingDraftView {
  const text = draft.trim();
  if (!isRequested || !hasTranslatableText(text)) {
    return null;
  }
  if (!isEnabled) {
    return { kind: 'failed' };
  }
  if (state.source === text && state.status === 'failed') {
    return { kind: 'failed' };
  }
  if (state.source === text && state.status === 'timedOut') {
    return { kind: 'timedOut' };
  }
  if (state.source === text && state.status === 'ready' && state.translated !== null) {
    return { kind: 'preview', text: state.translated };
  }
  if (support === 'downloadable' || support === 'downloading' || state.source !== text || state.status === 'translating') {
    return { kind: 'translating' };
  }
  return null;
}
