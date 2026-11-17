import type { Language } from '@lib/i18n/language';

export type TranslationSupport = 'unavailable' | 'downloadable' | 'downloading' | 'available' | 'failed';

export type EngineId = 'native' | 'bergamot';

export type PairKey = 'en-pt' | 'pt-en';

export interface TranslationProgressEvent {
  engine: EngineId;
  pair: PairKey;
  loaded: number;
  total: number;
}

export interface TranslationEngine {
  id: EngineId;
  support(source: Language, target: Language): Promise<TranslationSupport>;
  prepare(source: Language, target: Language): Promise<void>;
  translate(text: string, source: Language, target: Language, options?: { priority?: number }): Promise<string>;
  onProgress(listener: (event: TranslationProgressEvent) => void): () => void;
  /** Optional: called when a pair whose download failed may be tried again (e.g. after a cooldown). */
  onRetryAvailable?(listener: () => void): () => void;
}

export function pairKey(source: Language, target: Language): PairKey {
  return `${source}-${target}` as PairKey;
}
