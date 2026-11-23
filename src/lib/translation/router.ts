import type { Language } from '@lib/i18n/language';
import { loadBergamotEngine } from './engines/bergamot-loader';
import { nativeEngine } from './engines/native-engine';
import { pairKey, type PairKey, type SourceLanguage, type TranslationEngine, type TranslationSupport } from './types';

export const ENGINE_ROUTE_MEMO_MS = 30_000;

export type EngineRoute = { engine: TranslationEngine; support: TranslationSupport };

let fallbackLoader: (() => Promise<TranslationEngine>) | null = loadBergamotEngine;
let fallbackEngine: Promise<TranslationEngine> | null = null;
const routes = new Map<PairKey, { expiresAt: number; route: Promise<EngineRoute | null> }>();

export function registerFallbackEngine(load: () => Promise<TranslationEngine>): void {
  fallbackLoader = load;
  fallbackEngine = null;
  routes.clear();
}

function loadFallback(): Promise<TranslationEngine> | null {
  if (!fallbackLoader) {
    return null;
  }
  if (!fallbackEngine) {
    const loading = fallbackLoader();
    fallbackEngine = loading;
    loading.catch(() => {
      if (fallbackEngine === loading) {
        fallbackEngine = null;
      }
    });
  }
  return fallbackEngine;
}

async function computeRoute(source: SourceLanguage, target: Language): Promise<EngineRoute | null> {
  if ('Translator' in globalThis) {
    const support = await nativeEngine.support(source, target);
    if (support !== 'unavailable') {
      return { engine: nativeEngine, support };
    }
  }
  const loading = loadFallback();
  if (!loading) {
    return null;
  }
  try {
    const engine = await loading;
    return { engine, support: await engine.support(source, target) };
  } catch {
    return null;
  }
}

export function resolveEngine(source: SourceLanguage, target: Language): Promise<EngineRoute | null> {
  const key = pairKey(source, target);
  const now = Date.now();
  const memo = routes.get(key);
  if (memo && memo.expiresAt > now) {
    return memo.route;
  }
  const route = computeRoute(source, target).catch(() => null);
  const entry = { expiresAt: now + ENGINE_ROUTE_MEMO_MS, route };
  routes.set(key, entry);
  void route.then((resolved) => {
    if (resolved && !isFinalSupport(resolved.support) && routes.get(key) === entry) {
      routes.delete(key);
    }
  });
  return route;
}

function isFinalSupport(support: TranslationSupport): boolean {
  return support === 'available' || support === 'unavailable' || support === 'failed';
}

export function disposeTranslationEngines(): void {
  void fallbackEngine?.then(
    (engine) => engine.dispose?.(),
    () => undefined,
  );
}

export function invalidateEngineRoutes(): void {
  routes.clear();
}

export function resetRouterForTests(): void {
  fallbackLoader = null;
  fallbackEngine = null;
  routes.clear();
}
