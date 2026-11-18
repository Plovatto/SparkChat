import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_STALLED_PAIRS_STORAGE_KEY } from '@constants/storage-keys';
import {
  NATIVE_API_TIMEOUT_MS,
  NATIVE_DOWNLOAD_STALL_MS,
  NATIVE_STALL_MEMORY_MS,
  NATIVE_STALL_RECHECK_MS,
  armNativeOnFirstInteraction,
  nativeEngine,
  resetNativeEngineForTests,
} from './native-engine';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface FakeOptions {
  availability: Availability;
  translate?: (text: string) => string;
  failCreates?: number;
  failName?: string;
  progress?: number[];
  hangCreates?: boolean;
}

const fake: { createCalls: number; monitor?: EventTarget } = { createCalls: 0 };

function dispatchProgress(loaded: number): void {
  const event = new Event('downloadprogress') as Event & { loaded: number };
  event.loaded = loaded;
  fake.monitor!.dispatchEvent(event);
}

function installFakeTranslator(options: FakeOptions): void {
  let failuresLeft = options.failCreates ?? 0;
  fake.createCalls = 0;
  (globalThis as Record<string, unknown>).Translator = {
    availability: () => Promise.resolve(options.availability),
    create: (createOptions: { monitor?: (monitor: EventTarget) => void }) => {
      fake.createCalls += 1;
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        const error = new Error('create-failed');
        error.name = options.failName ?? 'NotAllowedError';
        return Promise.reject(error);
      }
      const monitor = new EventTarget();
      createOptions.monitor?.(monitor);
      fake.monitor = monitor;
      if (options.hangCreates) {
        return new Promise<never>(() => undefined);
      }
      for (const loaded of options.progress ?? []) {
        const event = new Event('downloadprogress') as Event & { loaded: number };
        event.loaded = loaded;
        monitor.dispatchEvent(event);
      }
      return Promise.resolve({ translate: (text: string) => Promise.resolve((options.translate ?? ((value) => value))(text)) });
    },
  };
}

class FakeWindow {
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener();
    }
  }

  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let fakeWindow: FakeWindow;

beforeEach(() => {
  resetNativeEngineForTests();
  fakeWindow = new FakeWindow();
  (globalThis as Record<string, unknown>).window = fakeWindow;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).Translator;
  delete (globalThis as Record<string, unknown>).window;
});

describe('nativeEngine', () => {
  it('reports unavailable when the API is absent', async () => {
    expect(await nativeEngine.support('en', 'pt')).toBe('unavailable');
  });

  it.each(['unavailable', 'downloadable', 'downloading', 'available'] as const)('maps availability %s', async (value) => {
    installFakeTranslator({ availability: value });
    expect(await nativeEngine.support('en', 'pt')).toBe(value);
  });

  it('creates one translator per pair and reuses it', async () => {
    installFakeTranslator({ availability: 'available', translate: (text) => `PT:${text}` });
    expect(await nativeEngine.translate('hi', 'en', 'pt')).toBe('PT:hi');
    await nativeEngine.translate('bye', 'en', 'pt');
    expect(fake.createCalls).toBe(1);
    await nativeEngine.translate('oi', 'pt', 'en');
    expect(fake.createCalls).toBe(2);
  });

  it('retries create after a failed create', async () => {
    installFakeTranslator({ availability: 'available', failCreates: 1, translate: (text) => `PT:${text}` });
    await expect(nativeEngine.translate('hi', 'en', 'pt')).rejects.toThrow('translate-failed');
    expect(await nativeEngine.translate('hi', 'en', 'pt')).toBe('PT:hi');
    expect(fake.createCalls).toBe(2);
  });

  it('does not leak message text in errors', async () => {
    installFakeTranslator({ availability: 'available', failCreates: 1 });
    await expect(nativeEngine.translate('secret text', 'en', 'pt')).rejects.not.toThrow(/secret/);
  });

  it('emits download progress to listeners', async () => {
    installFakeTranslator({ availability: 'downloadable', progress: [0.5, 1] });
    const events: unknown[] = [];
    const off = nativeEngine.onProgress((event) => events.push(event));
    await nativeEngine.prepare('en', 'pt');
    off();
    expect(events).toEqual([
      { engine: 'native', pair: 'en-pt', loaded: 0.5, total: 1 },
      { engine: 'native', pair: 'en-pt', loaded: 1, total: 1 },
    ]);
  });
});

describe('armNativeOnFirstInteraction', () => {
  it('prepares downloadable pairs on first interaction only', async () => {
    installFakeTranslator({ availability: 'downloadable' });
    armNativeOnFirstInteraction(['en-pt']);
    expect(fake.createCalls).toBe(0);
    fakeWindow.dispatch('pointerdown');
    await flush();
    expect(fake.createCalls).toBe(1);
    fakeWindow.dispatch('keydown');
    await flush();
    expect(fake.createCalls).toBe(1);
  });

  it('also prepares pairs whose download is already "downloading" (started elsewhere, maybe stalled)', async () => {
    installFakeTranslator({ availability: 'downloading' });
    armNativeOnFirstInteraction(['en-pt']);
    fakeWindow.dispatch('pointerdown');
    await flush();
    expect(fake.createCalls).toBe(1);
  });

  it('creates the pairs in the given order even when the first availability answers last', async () => {
    const order: string[] = [];
    (globalThis as Record<string, unknown>).Translator = {
      availability: ({ sourceLanguage }: { sourceLanguage: string }) =>
        new Promise((resolve) => setTimeout(() => resolve('downloadable'), sourceLanguage === 'pt' ? 5 : 0)),
      create: ({ sourceLanguage, targetLanguage }: { sourceLanguage: string; targetLanguage: string }) => {
        order.push(`${sourceLanguage}-${targetLanguage}`);
        return Promise.resolve({ translate: (text: string) => Promise.resolve(text) });
      },
    };
    armNativeOnFirstInteraction(['pt-en', 'en-pt']);
    fakeWindow.dispatch('pointerdown');
    await vi.waitFor(() => expect(order).toHaveLength(2));
    expect(order).toEqual(['pt-en', 'en-pt']);
  });

  it('skips pairs that are not downloadable', async () => {
    installFakeTranslator({ availability: 'available' });
    armNativeOnFirstInteraction(['en-pt']);
    fakeWindow.dispatch('keydown');
    await flush();
    expect(fake.createCalls).toBe(0);
  });

  it('arms again when create fails, so the next interaction retries', async () => {
    installFakeTranslator({ availability: 'downloadable', failCreates: 1 });
    armNativeOnFirstInteraction(['en-pt']);
    fakeWindow.dispatch('pointerdown');
    await flush();
    expect(fake.createCalls).toBe(1);
    expect(fakeWindow.count('pointerdown')).toBe(1);
    fakeWindow.dispatch('keydown');
    await flush();
    expect(fake.createCalls).toBe(2);
    expect(fakeWindow.count('pointerdown')).toBe(0);
    expect(fakeWindow.count('keydown')).toBe(0);
  });

  it('does not arm again after dispose', async () => {
    installFakeTranslator({ availability: 'downloadable', failCreates: 1 });
    const dispose = armNativeOnFirstInteraction(['en-pt']);
    fakeWindow.dispatch('pointerdown');
    dispose();
    await flush();
    expect(fake.createCalls).toBe(0);
    expect(fakeWindow.count('pointerdown')).toBe(0);
  });

  it('returns a disposer that removes the listeners', () => {
    installFakeTranslator({ availability: 'downloadable' });
    const dispose = armNativeOnFirstInteraction(['en-pt']);
    expect(fakeWindow.count('pointerdown')).toBe(1);
    dispose();
    expect(fakeWindow.count('pointerdown')).toBe(0);
    expect(fakeWindow.count('keydown')).toBe(0);
  });
});

describe('nativeEngine availability timeout', () => {
  beforeEach(() => {
    resetNativeEngineForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).Translator;
    resetNativeEngineForTests();
  });

  it('resolves unavailable after the timeout when availability never settles, and remembers it', async () => {
    const availability = vi.fn(() => new Promise<never>(() => undefined));
    (globalThis as Record<string, unknown>).Translator = { availability, create: vi.fn() };
    const pending = nativeEngine.support('en', 'pt');
    await vi.advanceTimersByTimeAsync(NATIVE_API_TIMEOUT_MS);
    expect(await pending).toBe('unavailable');
    expect(await nativeEngine.support('en', 'pt')).toBe('unavailable');
    expect(availability).toHaveBeenCalledTimes(1);
  });

  it('keeps the normal result when availability answers in time', async () => {
    installFakeTranslator({ availability: 'downloadable' });
    expect(await nativeEngine.support('en', 'pt')).toBe('downloadable');
    expect(await nativeEngine.support('en', 'pt')).toBe('downloadable');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a late usable answer brings the pair back to native and says so', async () => {
    let settle: (value: string) => void = () => undefined;
    const availability = vi.fn(() => new Promise<string>((resolve) => (settle = resolve)));
    (globalThis as Record<string, unknown>).Translator = { availability, create: vi.fn() };
    const retry = vi.fn();
    nativeEngine.onRetryAvailable!(retry);
    const pending = nativeEngine.support('en', 'pt');
    await vi.advanceTimersByTimeAsync(NATIVE_API_TIMEOUT_MS);
    expect(await pending).toBe('unavailable');
    expect(retry).not.toHaveBeenCalled();
    settle('downloadable');
    await vi.advanceTimersByTimeAsync(0);
    expect(retry).toHaveBeenCalledTimes(1);
    availability.mockImplementation(() => Promise.resolve('available'));
    expect(await nativeEngine.support('en', 'pt')).toBe('available');
    expect(availability).toHaveBeenCalledTimes(2);
  });

  it('a late "unavailable" answer keeps the pair on the fallback', async () => {
    let settle: (value: string) => void = () => undefined;
    const availability = vi.fn(() => new Promise<string>((resolve) => (settle = resolve)));
    (globalThis as Record<string, unknown>).Translator = { availability, create: vi.fn() };
    const retry = vi.fn();
    nativeEngine.onRetryAvailable!(retry);
    const pending = nativeEngine.support('en', 'pt');
    await vi.advanceTimersByTimeAsync(NATIVE_API_TIMEOUT_MS);
    expect(await pending).toBe('unavailable');
    settle('unavailable');
    await vi.advanceTimersByTimeAsync(0);
    expect(retry).not.toHaveBeenCalled();
    expect(await nativeEngine.support('en', 'pt')).toBe('unavailable');
    expect(availability).toHaveBeenCalledTimes(1);
  });
});

describe('nativeEngine stalled download', () => {
  beforeEach(() => {
    resetNativeEngineForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).Translator;
    resetNativeEngineForTests();
  });

  it('a download with no progress for the stall window makes the pair unavailable and says so', async () => {
    installFakeTranslator({ availability: 'downloadable', hangCreates: true });
    const retry = vi.fn();
    nativeEngine.onRetryAvailable!(retry);
    void nativeEngine.prepare('en', 'pt').catch(() => undefined);
    await vi.advanceTimersByTimeAsync(NATIVE_DOWNLOAD_STALL_MS - 1);
    expect(await nativeEngine.support('en', 'pt')).toBe('downloadable');
    expect(retry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(await nativeEngine.support('en', 'pt')).toBe('unavailable');
    expect(await nativeEngine.support('pt', 'en')).toBe('downloadable');
  });

  it('progress events keep a slow download alive', async () => {
    installFakeTranslator({ availability: 'downloadable', hangCreates: true });
    void nativeEngine.prepare('en', 'pt').catch(() => undefined);
    for (let step = 1; step <= 5; step += 1) {
      await vi.advanceTimersByTimeAsync(NATIVE_DOWNLOAD_STALL_MS - 1);
      dispatchProgress(step / 10);
    }
    expect(await nativeEngine.support('en', 'pt')).toBe('downloadable');
  });

  it('a create that fails for a reason other than the gesture makes the pair unavailable', async () => {
    installFakeTranslator({ availability: 'downloadable', failCreates: 1, failName: 'NotSupportedError' });
    const retry = vi.fn();
    nativeEngine.onRetryAvailable!(retry);
    await expect(nativeEngine.prepare('en', 'pt')).rejects.toThrow('model-load-failed');
    expect(retry).toHaveBeenCalledTimes(1);
    expect(await nativeEngine.support('en', 'pt')).toBe('unavailable');
  });

  it('a missing-gesture rejection is not a stall', async () => {
    installFakeTranslator({ availability: 'downloadable', failCreates: 1 });
    await expect(nativeEngine.prepare('en', 'pt')).rejects.toThrow('model-load-failed');
    await vi.advanceTimersByTimeAsync(NATIVE_DOWNLOAD_STALL_MS);
    expect(await nativeEngine.support('en', 'pt')).toBe('downloadable');
  });

  it('a stalled download that finishes later brings the pair back to native', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const create = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    (globalThis as Record<string, unknown>).Translator = {
      availability: vi.fn(() => Promise.resolve('downloadable')),
      create,
    };
    const retry = vi.fn();
    nativeEngine.onRetryAvailable!(retry);
    const prepared = nativeEngine.prepare('en', 'pt');
    const waiting = nativeEngine.translate('hello', 'en', 'pt');
    const preparedFails = expect(prepared).rejects.toThrow('model-load-failed');
    const waitingFails = expect(waiting).rejects.toThrow('translate-failed');
    await vi.advanceTimersByTimeAsync(NATIVE_DOWNLOAD_STALL_MS);
    await preparedFails;
    await waitingFails;
    expect(await nativeEngine.support('en', 'pt')).toBe('unavailable');
    finish({ translate: (text: string) => Promise.resolve(`PT:${text}`) });
    await vi.advanceTimersByTimeAsync(0);
    expect(retry).toHaveBeenCalledTimes(2);
    expect(await nativeEngine.support('en', 'pt')).toBe('downloadable');
    expect(await nativeEngine.translate('hi', 'en', 'pt')).toBe('PT:hi');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('an available pair leaves no stall timer once created', async () => {
    installFakeTranslator({ availability: 'available' });
    await nativeEngine.prepare('en', 'pt');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a stalled pair whose model becomes available another way goes back to native', async () => {
    let state = 'downloadable';
    (globalThis as Record<string, unknown>).Translator = {
      availability: vi.fn(() => Promise.resolve(state)),
      create: vi.fn(() => new Promise<never>(() => undefined)),
    };
    const retry = vi.fn();
    nativeEngine.onRetryAvailable!(retry);
    void nativeEngine.prepare('en', 'pt').catch(() => undefined);
    await vi.advanceTimersByTimeAsync(NATIVE_DOWNLOAD_STALL_MS);
    expect(retry).toHaveBeenCalledTimes(1);
    state = 'downloading';
    expect(await nativeEngine.support('en', 'pt')).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(0);
    expect(retry).toHaveBeenCalledTimes(1);
    state = 'available';
    expect(await nativeEngine.support('en', 'pt')).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(0);
    expect(retry).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(NATIVE_STALL_RECHECK_MS);
    expect(await nativeEngine.support('en', 'pt')).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(0);
    expect(retry).toHaveBeenCalledTimes(2);
    expect(await nativeEngine.support('en', 'pt')).toBe('available');
  });
});

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('nativeEngine stall memory across sessions', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    resetNativeEngineForTests();
    vi.useFakeTimers();
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).Translator;
    resetNativeEngineForTests();
  });

  async function stallOnce(): Promise<void> {
    installFakeTranslator({ availability: 'downloadable', hangCreates: true });
    void nativeEngine.prepare('pt', 'en').catch(() => undefined);
    await vi.advanceTimersByTimeAsync(NATIVE_DOWNLOAD_STALL_MS);
    expect(await nativeEngine.support('pt', 'en')).toBe('unavailable');
  }

  it('a pair that stalled stays on the fallback after a reload, without waiting for another stall', async () => {
    await stallOnce();
    resetNativeEngineForTests();
    installFakeTranslator({ availability: 'downloadable', hangCreates: true });
    expect(await nativeEngine.support('pt', 'en')).toBe('unavailable');
    expect(await nativeEngine.support('en', 'pt')).toBe('downloadable');
    expect(fake.createCalls).toBe(0);
  });

  it('the remembered stall expires, and native is tried again', async () => {
    await stallOnce();
    await vi.advanceTimersByTimeAsync(NATIVE_STALL_MEMORY_MS);
    resetNativeEngineForTests();
    installFakeTranslator({ availability: 'downloadable' });
    expect(await nativeEngine.support('pt', 'en')).toBe('downloadable');
  });

  it('a remembered stall whose model is now available goes back to native and is forgotten', async () => {
    await stallOnce();
    resetNativeEngineForTests();
    installFakeTranslator({ availability: 'available' });
    const retry = vi.fn();
    nativeEngine.onRetryAvailable!(retry);
    expect(await nativeEngine.support('pt', 'en')).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(0);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(await nativeEngine.support('pt', 'en')).toBe('available');
    resetNativeEngineForTests();
    installFakeTranslator({ availability: 'downloadable' });
    expect(await nativeEngine.support('pt', 'en')).toBe('downloadable');
  });

  it('a stalled download that finishes later is forgotten too', async () => {
    let finish: (value: unknown) => void = () => undefined;
    (globalThis as Record<string, unknown>).Translator = {
      availability: vi.fn(() => Promise.resolve('downloadable')),
      create: vi.fn(() => new Promise((resolve) => (finish = resolve))),
    };
    void nativeEngine.prepare('pt', 'en').catch(() => undefined);
    await vi.advanceTimersByTimeAsync(NATIVE_DOWNLOAD_STALL_MS);
    expect(await nativeEngine.support('pt', 'en')).toBe('unavailable');
    finish({ translate: (text: string) => Promise.resolve(text) });
    await vi.advanceTimersByTimeAsync(0);
    resetNativeEngineForTests();
    installFakeTranslator({ availability: 'downloadable' });
    expect(await nativeEngine.support('pt', 'en')).toBe('downloadable');
  });

  it('unreadable or blocked storage falls back to the in-memory behaviour', async () => {
    storage.setItem(NATIVE_STALLED_PAIRS_STORAGE_KEY, '{not json');
    installFakeTranslator({ availability: 'downloadable' });
    expect(await nativeEngine.support('pt', 'en')).toBe('downloadable');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    await stallOnce();
    expect(fake.createCalls).toBe(1);
  });

  it('after a reload, an interaction still retries the native download of a remembered stall in the background', async () => {
    await stallOnce();
    resetNativeEngineForTests();
    let finish: (value: unknown) => void = () => undefined;
    const create = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    (globalThis as Record<string, unknown>).Translator = {
      availability: vi.fn(() => Promise.resolve('downloadable')),
      create,
    };
    const retry = vi.fn();
    nativeEngine.onRetryAvailable!(retry);
    const dispose = armNativeOnFirstInteraction(['pt-en']);
    fakeWindow.dispatch('pointerdown');
    await vi.advanceTimersByTimeAsync(0);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await nativeEngine.support('pt', 'en')).toBe('unavailable');
    finish({ translate: (text: string) => Promise.resolve(`EN:${text}`) });
    await vi.advanceTimersByTimeAsync(0);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(await nativeEngine.translate('oi', 'pt', 'en')).toBe('EN:oi');
    resetNativeEngineForTests();
    installFakeTranslator({ availability: 'downloadable' });
    expect(await nativeEngine.support('pt', 'en')).toBe('downloadable');
    dispose();
  });

  it('a pair that stalls again is not retried on every click and keeps its original expiry', async () => {
    await stallOnce();
    const firstExpiry = storage.getItem(NATIVE_STALLED_PAIRS_STORAGE_KEY);
    await vi.advanceTimersByTimeAsync(60_000);
    resetNativeEngineForTests();
    installFakeTranslator({ availability: 'downloadable', hangCreates: true });
    const dispose = armNativeOnFirstInteraction(['pt-en']);
    fakeWindow.dispatch('pointerdown');
    await vi.advanceTimersByTimeAsync(NATIVE_DOWNLOAD_STALL_MS);
    expect(fake.createCalls).toBe(1);
    expect(fakeWindow.count('pointerdown')).toBe(0);
    fakeWindow.dispatch('pointerdown');
    await vi.advanceTimersByTimeAsync(NATIVE_DOWNLOAD_STALL_MS);
    expect(fake.createCalls).toBe(1);
    expect(storage.getItem(NATIVE_STALLED_PAIRS_STORAGE_KEY)).toBe(firstExpiry);
    dispose();
  });

  it('a create that fails for another reason does not re-arm the interaction', async () => {
    installFakeTranslator({ availability: 'downloadable', failCreates: 1, failName: 'NotSupportedError' });
    const dispose = armNativeOnFirstInteraction(['pt-en']);
    fakeWindow.dispatch('pointerdown');
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.createCalls).toBe(1);
    expect(fakeWindow.count('pointerdown')).toBe(0);
    dispose();
  });

  it('an entry that expires further out than the memory window is ignored', async () => {
    storage.setItem(NATIVE_STALLED_PAIRS_STORAGE_KEY, JSON.stringify({ 'pt-en': Date.now() + NATIVE_STALL_MEMORY_MS * 10 }));
    installFakeTranslator({ availability: 'downloadable' });
    expect(await nativeEngine.support('pt', 'en')).toBe('downloadable');
  });
});
