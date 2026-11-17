import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loaded = vi.hoisted(() => ({ engineModule: 0 }));

vi.mock('./bergamot-engine', () => {
  loaded.engineModule += 1;
  return { bergamotEngine: { id: 'bergamot', marker: 'real-engine' } };
});

import { isBergamotRuntimeSupported, loadBergamotEngine } from './bergamot-loader';

beforeEach(() => {
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('Worker', class {});
  vi.stubGlobal('caches', {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bergamot loader', () => {
  it('detects the runtime features the engine needs', () => {
    expect(isBergamotRuntimeSupported()).toBe(true);
    for (const missing of ['isSecureContext', 'Worker', 'caches', 'DecompressionStream', 'WebAssembly']) {
      vi.stubGlobal(missing, undefined);
      Reflect.deleteProperty(globalThis, missing);
      expect(isBergamotRuntimeSupported()).toBe(false);
      vi.unstubAllGlobals();
      vi.stubGlobal('isSecureContext', true);
      vi.stubGlobal('Worker', class {});
      vi.stubGlobal('caches', {});
    }
    vi.stubGlobal('isSecureContext', false);
    expect(isBergamotRuntimeSupported()).toBe(false);
  });

  it('returns an unavailable engine without importing the engine module when unsupported', async () => {
    Reflect.deleteProperty(globalThis, 'caches');
    const engine = await loadBergamotEngine();
    expect(loaded.engineModule).toBe(0);
    expect(engine.id).toBe('bergamot');
    expect(await engine.support('en', 'pt')).toBe('unavailable');
    await expect(engine.prepare('en', 'pt')).rejects.toThrow('model-load-failed');
    await expect(engine.translate('hello there', 'en', 'pt')).rejects.toThrow('translate-failed');
    expect(typeof engine.onProgress(() => undefined)).toBe('function');
  });

  it('imports the engine lazily when the runtime is supported', async () => {
    const engine = await loadBergamotEngine();
    expect(loaded.engineModule).toBe(1);
    expect((engine as unknown as { marker: string }).marker).toBe('real-engine');
  });
});
