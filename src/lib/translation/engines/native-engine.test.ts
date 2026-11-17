import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_API_TIMEOUT_MS, armNativeOnFirstInteraction, nativeEngine, resetNativeEngineForTests } from './native-engine';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface FakeOptions {
  availability: Availability;
  translate?: (text: string) => string;
  failCreates?: number;
  progress?: number[];
}

const fake = { createCalls: 0 };

function installFakeTranslator(options: FakeOptions): void {
  let failuresLeft = options.failCreates ?? 0;
  fake.createCalls = 0;
  (globalThis as Record<string, unknown>).Translator = {
    availability: () => Promise.resolve(options.availability),
    create: (createOptions: { monitor?: (monitor: EventTarget) => void }) => {
      fake.createCalls += 1;
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        return Promise.reject(new Error('create-failed'));
      }
      const monitor = new EventTarget();
      createOptions.monitor?.(monitor);
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

  it('skips pairs that are not downloadable', async () => {
    installFakeTranslator({ availability: 'available' });
    armNativeOnFirstInteraction(['en-pt']);
    fakeWindow.dispatch('keydown');
    await flush();
    expect(fake.createCalls).toBe(0);
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

  it('ignores a late availability result after the timeout', async () => {
    let settle: (value: string) => void = () => undefined;
    const availability = vi.fn(() => new Promise<string>((resolve) => (settle = resolve)));
    (globalThis as Record<string, unknown>).Translator = { availability, create: vi.fn() };
    const pending = nativeEngine.support('en', 'pt');
    await vi.advanceTimersByTimeAsync(NATIVE_API_TIMEOUT_MS);
    expect(await pending).toBe('unavailable');
    settle('available');
    await vi.advanceTimersByTimeAsync(0);
    expect(await nativeEngine.support('en', 'pt')).toBe('unavailable');
    expect(availability).toHaveBeenCalledTimes(1);
  });
});
