import type { TranslationEngine } from '../types';

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

export function loadBergamotEngine(): Promise<TranslationEngine> {
  if (!isBergamotRuntimeSupported()) {
    return Promise.resolve(unavailableEngine);
  }
  return import('./bergamot-engine').then((module) => module.bergamotEngine);
}
