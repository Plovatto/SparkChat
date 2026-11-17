export { armNativeOnFirstInteraction, nativeEngine } from './engines/native-engine';
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
