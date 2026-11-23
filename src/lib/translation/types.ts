import type { Language } from '@lib/i18n/language';

export type TranslationSupport = 'unavailable' | 'downloadable' | 'downloading' | 'available' | 'failed';

export type EngineId = 'native' | 'bergamot';

export type SourceLanguage = Language | 'es';

export type PairKey = 'en-pt' | 'pt-en' | 'es-pt' | 'es-en';

export interface TranslationProgressEvent {
  engine: EngineId;
  pair: PairKey;
  loaded: number;
  total: number;
}

export interface TranslationEngine {
  id: EngineId;
  support(source: SourceLanguage, target: Language): Promise<TranslationSupport>;
  prepare(source: SourceLanguage, target: Language): Promise<void>;
  translate(text: string, source: SourceLanguage, target: Language, options?: { priority?: number }): Promise<string>;
  onProgress(listener: (event: TranslationProgressEvent) => void): () => void;
  onRetryAvailable?(listener: () => void): () => void;
  dispose?(): void;
}

export function pairKey(source: SourceLanguage, target: Language): PairKey {
  return `${source}-${target}` as PairKey;
}
