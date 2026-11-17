import type { TranslationEngine } from '../types';

/** Cheap feature check; importing this module never pulls the Bergamot engine or package. */
export function isBergamotRuntimeSupported(): boolean {
  return (
    globalThis.isSecureContext === true &&
    typeof globalThis.Worker === 'function' &&
    typeof globalThis.WebAssembly === 'object' &&
    'DecompressionStream' in globalThis &&
    'caches' in globalThis
  );
}

const unavailableEngine: TranslationEngine = {
  id: 'bergamot',
  support: () => Promise.resolve('unavailable'),
  prepare: () => Promise.reject(new Error('model-load-failed')),
  translate: () => Promise.reject(new Error('translate-failed')),
  onProgress: () => () => undefined,
};

/** The only way to reach `bergamot-engine.ts`: a dynamic import, so it stays in its own chunk. */
export function loadBergamotEngine(): Promise<TranslationEngine> {
  if (!isBergamotRuntimeSupported()) {
    return Promise.resolve(unavailableEngine);
  }
  return import('./bergamot-engine').then((module) => module.bergamotEngine);
}
