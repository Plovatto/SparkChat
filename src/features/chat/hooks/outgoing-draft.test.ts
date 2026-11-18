import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOutgoingDraftTranslator,
  describeOutgoingDraft,
  OUTGOING_SEND_TIMEOUT_MS,
  OUTGOING_TRANSLATION_DEBOUNCE_MS,
  type OutgoingDraftState,
} from './outgoing-draft';

describe('describeOutgoingDraft', () => {
  const ready: OutgoingDraftState = { status: 'ready', source: 'bom dia', translated: 'good morning' };

  it('shows nothing when disabled or the draft has nothing to translate', () => {
    expect(describeOutgoingDraft({ isRequested: false, isEnabled: false, support: 'available', state: ready, draft: 'bom dia' })).toBeNull();
    expect(describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'available', state: ready, draft: '   ' })).toBeNull();
    expect(
      describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'available', state: { status: 'idle', source: 'kkkk', translated: null }, draft: 'kkkk' }),
    ).toBeNull();
  });

  it('previews the translation of the current draft only', () => {
    expect(describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'available', state: ready, draft: ' bom dia ' })).toEqual({
      kind: 'preview',
      text: 'good morning',
    });
    expect(describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'available', state: ready, draft: 'bom dia gente' })).toEqual({
      kind: 'translating',
    });
  });

  it('shows translating while the model downloads', () => {
    const translating: OutgoingDraftState = { status: 'translating', source: 'bom dia', translated: null };
    expect(describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'downloadable', state: translating, draft: 'bom dia' })).toEqual({ kind: 'translating' });
    expect(describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'downloading', state: translating, draft: 'bom dia' })).toEqual({ kind: 'translating' });
    // An older draft's translation is never previewed, whatever the support.
    expect(describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'downloading', state: ready, draft: 'bom dia gente' })).toEqual({ kind: 'translating' });
  });

  it('previews a ready translation of the current draft even if the route still says downloading', () => {
    for (const support of ['downloadable', 'downloading'] as const) {
      expect(describeOutgoingDraft({ isRequested: true, isEnabled: true, support, state: ready, draft: 'bom dia' })).toEqual({
        kind: 'preview',
        text: 'good morning',
      });
    }
  });

  it('shows the timed-out notice for the current draft only', () => {
    const timedOut: OutgoingDraftState = { status: 'timedOut', source: 'bom dia', translated: null };
    expect(describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'available', state: timedOut, draft: 'bom dia' })).toEqual({ kind: 'timedOut' });
    expect(describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'downloading', state: timedOut, draft: 'bom dia' })).toEqual({ kind: 'timedOut' });
    expect(describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'available', state: timedOut, draft: 'boa noite' })).toEqual({ kind: 'translating' });
  });

  it('shows the failure notice', () => {
    expect(
      describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'available', state: { status: 'failed', source: 'bom dia', translated: null }, draft: 'bom dia' }),
    ).toEqual({ kind: 'failed' });
  });

  it('warns that the draft goes as is when the room asks for translation but it cannot run', () => {
    for (const support of ['unavailable', 'failed'] as const) {
      expect(describeOutgoingDraft({ isRequested: true, isEnabled: false, support, state: ready, draft: 'bom dia' })).toEqual({ kind: 'failed' });
    }
    expect(describeOutgoingDraft({ isRequested: true, isEnabled: false, support: 'unavailable', state: ready, draft: 'kkkk' })).toBeNull();
  });

  it('shows a failure of the current draft even while the model downloads', () => {
    const failed: OutgoingDraftState = { status: 'failed', source: 'bom dia', translated: null };
    expect(describeOutgoingDraft({ isRequested: true, isEnabled: true, support: 'downloading', state: failed, draft: 'bom dia' })).toEqual({
      kind: 'failed',
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('createOutgoingDraftTranslator', () => {
  let translateCalls: string[];
  let lastState: OutgoingDraftState | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    translateCalls = [];
    lastState = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function track(translate: (text: string) => Promise<string>) {
    const draft = createOutgoingDraftTranslator(async (text) => {
      translateCalls.push(text);
      return translate(text);
    });
    draft.subscribe((state) => {
      lastState = state;
    });
    return draft;
  }

  it('uses the agreed debounce', () => {
    expect(OUTGOING_TRANSLATION_DEBOUNCE_MS).toBe(400);
  });

  it('debounces and translates the latest draft', async () => {
    const d = track((t) => Promise.resolve(`EN:${t}`));
    d.update('bom');
    d.update('bom dia');
    await vi.advanceTimersByTimeAsync(399);
    expect(translateCalls).toEqual([]);
    expect(lastState?.status).toBe('translating');
    await vi.advanceTimersByTimeAsync(1);
    expect(lastState).toEqual({ status: 'ready', source: 'bom dia', translated: 'EN:bom dia' });
    expect(translateCalls).toEqual(['bom dia']);
  });

  it('uses a ready translation of the same text without translating again', async () => {
    const d = track((t) => Promise.resolve(`EN:${t}`));
    d.update('bom dia');
    await vi.advanceTimersByTimeAsync(400);
    expect(await d.resolveForSend('bom dia')).toEqual({ text: 'EN:bom dia', translated: true });
    expect(translateCalls).toEqual(['bom dia']);
  });

  it('send waits for an in-flight translation of the same text', async () => {
    const pending = deferred<string>();
    const d = track(() => pending.promise);
    d.update('bom dia');
    await vi.advanceTimersByTimeAsync(400);
    expect(translateCalls).toEqual(['bom dia']);
    let sent: { text: string; translated: boolean } | undefined;
    void d.resolveForSend('bom dia').then((result) => {
      sent = result;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toBeUndefined();
    pending.resolve('good morning');
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual({ text: 'good morning', translated: true });
    expect(translateCalls).toEqual(['bom dia']);
  });

  it('send during the debounce translates the final text right away, once', async () => {
    const d = track((t) => Promise.resolve(`EN:${t}`));
    d.update('bom dia');
    expect(await d.resolveForSend('bom dia')).toEqual({ text: 'EN:bom dia', translated: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(translateCalls).toEqual(['bom dia']);
    expect(lastState).toEqual({ status: 'ready', source: 'bom dia', translated: 'EN:bom dia' });
  });

  it('never sends a stale translation', async () => {
    const d = track((t) => Promise.resolve(`EN:${t}`));
    d.update('bom dia');
    await vi.advanceTimersByTimeAsync(400);
    expect(lastState?.status).toBe('ready');
    expect(await d.resolveForSend('bom dia gente')).toEqual({ text: 'EN:bom dia gente', translated: true });
    expect(translateCalls).toEqual(['bom dia', 'bom dia gente']);
  });

  it('discards the result of an older draft', async () => {
    const first = deferred<string>();
    const d = track((t) => (t === 'bom dia' ? first.promise : Promise.resolve(`EN:${t}`)));
    d.update('bom dia');
    await vi.advanceTimersByTimeAsync(400);
    d.update('boa noite');
    first.resolve('good morning');
    await vi.advanceTimersByTimeAsync(0);
    expect(lastState).toEqual({ status: 'translating', source: 'boa noite', translated: null });
    await vi.advanceTimersByTimeAsync(400);
    expect(lastState).toEqual({ status: 'ready', source: 'boa noite', translated: 'EN:boa noite' });
  });

  it('a failed translation is not sent: the notice shows first, the next send goes as is', async () => {
    const d = track(() => Promise.reject(new Error('translate-failed')));
    await expect(d.resolveForSend('olá pessoal')).rejects.toThrow(/^outgoing-translate-failed$/);
    expect(lastState).toEqual({ status: 'failed', source: 'olá pessoal', translated: null });
    expect(await d.resolveForSend('olá pessoal')).toEqual({ text: 'olá pessoal', translated: false });
    expect(translateCalls).toEqual(['olá pessoal']);
  });

  it('a draft whose translation already failed on screen is sent as is at once', async () => {
    const d = track(() => Promise.reject(new Error('translate-failed')));
    d.update('olá pessoal');
    await vi.advanceTimersByTimeAsync(400);
    expect(lastState?.status).toBe('failed');
    expect(await d.resolveForSend('olá pessoal')).toEqual({ text: 'olá pessoal', translated: false });
    expect(translateCalls).toEqual(['olá pessoal']);
  });

  it('a failure notice for another text does not let a new text go untranslated', async () => {
    const d = track((t) => (t === 'olá pessoal' ? Promise.reject(new Error('translate-failed')) : Promise.resolve(`EN:${t}`)));
    d.update('olá pessoal');
    await vi.advanceTimersByTimeAsync(400);
    expect(await d.resolveForSend('boa noite pessoal')).toEqual({ text: 'EN:boa noite pessoal', translated: true });
  });

  it('retryFailed translates a failed draft again (the engine changed)', async () => {
    let fail = true;
    const d = track((t) => (fail ? Promise.reject(new Error('translate-failed')) : Promise.resolve(`EN:${t}`)));
    d.update('olá pessoal');
    await vi.advanceTimersByTimeAsync(400);
    expect(lastState?.status).toBe('failed');
    fail = false;
    d.retryFailed();
    expect(lastState).toEqual({ status: 'translating', source: 'olá pessoal', translated: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(lastState).toEqual({ status: 'ready', source: 'olá pessoal', translated: 'EN:olá pessoal' });
    expect(translateCalls).toEqual(['olá pessoal', 'olá pessoal']);
  });

  it('retryFailed leaves ready, idle and disposed drafts alone', async () => {
    const d = track((t) => Promise.resolve(`EN:${t}`));
    d.retryFailed();
    expect(translateCalls).toEqual([]);
    d.update('olá pessoal');
    await vi.advanceTimersByTimeAsync(400);
    d.retryFailed();
    expect(translateCalls).toEqual(['olá pessoal']);
    const failing = track(() => Promise.reject(new Error('translate-failed')));
    failing.update('boa noite pessoal');
    await vi.advanceTimersByTimeAsync(400);
    failing.dispose();
    failing.retryFailed();
    expect(translateCalls).toEqual(['olá pessoal', 'boa noite pessoal']);
  });

  it('reports a failed draft translation', async () => {
    const d = track(() => Promise.reject(new Error('translate-failed')));
    d.update('olá pessoal');
    await vi.advanceTimersByTimeAsync(400);
    expect(lastState).toEqual({ status: 'failed', source: 'olá pessoal', translated: null });
  });

  it('does not translate drafts without translatable text', async () => {
    const d = track((t) => Promise.resolve(`EN:${t}`));
    d.update('kkkk @Ana');
    await vi.advanceTimersByTimeAsync(1000);
    expect(translateCalls).toEqual([]);
    expect(lastState).toEqual({ status: 'idle', source: 'kkkk @Ana', translated: null });
    expect(await d.resolveForSend('kkkk @Ana')).toEqual({ text: 'kkkk @Ana', translated: false });
    expect(translateCalls).toEqual([]);
  });

  it('concurrent sends of the same text share one translation (Enter pressed twice)', async () => {
    const pending = deferred<string>();
    const d = track(() => pending.promise);
    const a = d.resolveForSend('bom dia');
    const b = d.resolveForSend('bom dia');
    pending.resolve('good morning');
    expect(await a).toEqual({ text: 'good morning', translated: true });
    expect(await b).toEqual({ text: 'good morning', translated: true });
    expect(translateCalls).toEqual(['bom dia']);
  });

  it('a pending send never resolves with any text once disposed (room change)', async () => {
    const pending = deferred<string>();
    const d = track(() => pending.promise);
    d.update('bom dia');
    await vi.advanceTimersByTimeAsync(400);
    const send = d.resolveForSend('bom dia');
    d.dispose();
    pending.resolve('good morning');
    await expect(send).rejects.toThrow(/^outgoing-draft-disposed$/);
  });

  it('stops translating and notifying after dispose', async () => {
    const d = track((t) => Promise.resolve(`EN:${t}`));
    d.update('bom dia');
    d.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(translateCalls).toEqual([]);
    expect(lastState?.status).toBe('translating');
    d.update('boa noite');
    expect(lastState?.source).toBe('bom dia');
    await expect(d.resolveForSend('segredo pessoal')).rejects.toThrow(/^outgoing-draft-disposed$/);
  });

  it('uses a 10 s send timeout', () => {
    expect(OUTGOING_SEND_TIMEOUT_MS).toBe(10_000);
  });

  it('a send that does not settle in time is cancelled, never resolved with the original', async () => {
    const pending = deferred<string>();
    const d = track(() => pending.promise);
    d.update('bom dia');
    let outcome: unknown;
    d.resolveForSend('bom dia').then(
      (result) => (outcome = result),
      (error: Error) => (outcome = error.message),
    );
    await vi.advanceTimersByTimeAsync(OUTGOING_SEND_TIMEOUT_MS - 1);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBe('outgoing-send-timeout');
    // Its own notice: nothing was sent (not the "will be sent as is" one).
    expect(lastState).toEqual({ status: 'timedOut', source: 'bom dia', translated: null });
    // The translation keeps running; once it lands, the next send uses it without translating again.
    pending.resolve('good morning');
    await vi.advanceTimersByTimeAsync(0);
    expect(lastState).toEqual({ status: 'ready', source: 'bom dia', translated: 'good morning' });
    expect(await d.resolveForSend('bom dia')).toEqual({ text: 'good morning', translated: true });
    expect(translateCalls).toEqual(['bom dia']);
  });

  it('a fast send leaves no timeout behind', async () => {
    const d = track((t) => Promise.resolve(`EN:${t}`));
    expect(await d.resolveForSend('bom dia')).toEqual({ text: 'EN:bom dia', translated: true });
    await vi.advanceTimersByTimeAsync(OUTGOING_SEND_TIMEOUT_MS * 2);
    expect(lastState).toEqual({ status: 'ready', source: 'bom dia', translated: 'EN:bom dia' });
  });

  it('cancelPendingSends rejects the awaiting send right away, without text', async () => {
    const pending = deferred<string>();
    const d = track(() => pending.promise);
    const send = d.resolveForSend('segredo pessoal');
    d.cancelPendingSends();
    await expect(send).rejects.toThrow(/^outgoing-send-cancelled$/);
    pending.resolve('personal secret');
    await vi.advanceTimersByTimeAsync(OUTGOING_SEND_TIMEOUT_MS);
    expect(await d.resolveForSend('segredo pessoal')).toEqual({ text: 'personal secret', translated: true });
  });
});
