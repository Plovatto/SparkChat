import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOutgoingDraftTranslator,
  describeOutgoingDraft,
  OUTGOING_TRANSLATION_DEBOUNCE_MS,
  type OutgoingDraftState,
} from './outgoing-draft';

describe('describeOutgoingDraft', () => {
  const ready: OutgoingDraftState = { status: 'ready', source: 'bom dia', translated: 'good morning' };

  it('shows nothing when disabled or the draft has nothing to translate', () => {
    expect(describeOutgoingDraft({ isEnabled: false, support: 'available', state: ready, draft: 'bom dia' })).toBeNull();
    expect(describeOutgoingDraft({ isEnabled: true, support: 'available', state: ready, draft: '   ' })).toBeNull();
    expect(
      describeOutgoingDraft({ isEnabled: true, support: 'available', state: { status: 'idle', source: 'kkkk', translated: null }, draft: 'kkkk' }),
    ).toBeNull();
  });

  it('previews the translation of the current draft only', () => {
    expect(describeOutgoingDraft({ isEnabled: true, support: 'available', state: ready, draft: ' bom dia ' })).toEqual({
      kind: 'preview',
      text: 'good morning',
    });
    expect(describeOutgoingDraft({ isEnabled: true, support: 'available', state: ready, draft: 'bom dia gente' })).toEqual({
      kind: 'translating',
    });
  });

  it('shows translating while the model downloads', () => {
    expect(describeOutgoingDraft({ isEnabled: true, support: 'downloadable', state: ready, draft: 'bom dia' })).toEqual({ kind: 'translating' });
    expect(describeOutgoingDraft({ isEnabled: true, support: 'downloading', state: ready, draft: 'bom dia' })).toEqual({ kind: 'translating' });
  });

  it('shows the failure notice', () => {
    expect(
      describeOutgoingDraft({ isEnabled: true, support: 'available', state: { status: 'failed', source: 'bom dia', translated: null }, draft: 'bom dia' }),
    ).toEqual({ kind: 'failed' });
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

  it('falls back to the original on failure', async () => {
    const d = createOutgoingDraftTranslator(() => Promise.reject(new Error('x')));
    expect(await d.resolveForSend('olá pessoal')).toEqual({ text: 'olá pessoal', translated: false });
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
});
