export { armNativeOnFirstInteraction, nativeEngine } from './engines/native-engine';
export { isBergamotRuntimeSupported, loadBergamotEngine } from './engines/bergamot-loader';
export { pairKey } from './types';
export type { EngineId, PairKey, TranslationEngine, TranslationProgressEvent, TranslationSupport } from './types';
export {
  hasTranslatableText,
  MIN_TRANSLATABLE_LETTERS,
  splitSegments,
  translatableText,
  translatePreservingSegments,
} from './segments';
export type { Segment } from './segments';
export { detectLanguage } from './detection';
export { detectPtEn } from './heuristic-detector';
export type { DetectedLanguage } from './heuristic-detector';
export {
  captureTranslationEpoch,
  clearTranslationCache,
  clearTranslationsForRoom,
  forgetTranslation,
  isTranslationEpochCurrent,
  readTranslation,
  TRANSLATION_CACHE_SIZE,
  translationCacheKey,
  writeTranslation,
} from './translation-cache';
export type { CachedTranslation, TranslationEpoch } from './translation-cache';
export { disposeTranslationEngines, ENGINE_ROUTE_MEMO_MS, invalidateEngineRoutes, registerFallbackEngine, resolveEngine } from './router';
export type { EngineRoute } from './router';
export {
  getCachedIncoming,
  MIN_DETECTION_CONFIDENCE,
  subscribeIncomingInvalidation,
  translateIncoming,
  TRANSLATION_JOB_TIMEOUT_MS,
} from './incoming';
export type { IncomingRequest, IncomingResult } from './incoming';
