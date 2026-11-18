import type { IncomingAssessment, IncomingResult } from '@lib/translation/incoming';

export type TranslationMode = 'off' | 'manual' | 'auto';

export type TranslationControl = 'offer' | 'preparing' | 'translated' | 'original' | 'none';

export interface FetchedTranslation {
  key: string;
  result: IncomingResult;
}

export function hasText(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.trim() !== '';
}

function isOfferable(assessment: IncomingAssessment | null): boolean {
  return assessment === 'other' || assessment === 'unsure';
}

export function shouldRequestTranslation(params: {
  mode: TranslationMode;
  requested: boolean;
  isVisible: boolean;
  text: string | null | undefined;
  current: IncomingResult | undefined;
  assessment: IncomingAssessment | null;
}): boolean {
  const { mode, requested, isVisible, text, current, assessment } = params;
  if (mode === 'off' || !hasText(text)) {
    return false;
  }
  if (current !== undefined && current.status !== 'preparing') {
    return false;
  }
  if (requested) {
    return true;
  }
  return mode === 'auto' && isVisible && (current?.status === 'preparing' || isOfferable(assessment));
}

export function shouldRetryOnInvalidation(params: { current: IncomingResult | undefined; cached: IncomingResult | undefined }): boolean {
  const { current, cached } = params;
  if (current?.status === 'preparing') {
    return true;
  }
  return current?.status === 'none' && cached === undefined;
}

export function selectCurrentResult(params: {
  active: boolean;
  key: string;
  fetched: FetchedTranslation | null;
  cached: IncomingResult | undefined;
}): IncomingResult | undefined {
  const { active, key, fetched, cached } = params;
  if (!active) {
    return undefined;
  }
  if (fetched?.key !== key) {
    return cached;
  }
  if (fetched.result.status === 'none' && cached?.status === 'translated') {
    return cached;
  }
  return fetched.result;
}

export type RevealAction = 'refetch' | 'clear' | 'none';

export function resolveRevealAction(params: {
  becameVisible: boolean;
  requested: boolean;
  needsRequest: boolean;
  retryOnInvalidation: boolean;
}): RevealAction {
  const { becameVisible, requested, needsRequest, retryOnInvalidation } = params;
  if (!becameVisible) {
    return 'none';
  }
  if (needsRequest) {
    return requested ? 'refetch' : 'none';
  }
  return retryOnInvalidation ? 'clear' : 'none';
}

export function shouldEndExplicitRequest(result: IncomingResult): boolean {
  return result.status === 'none';
}

export function resolveVisibleResult(params: { mode: TranslationMode; current: IncomingResult | undefined }): IncomingResult | undefined {
  const { mode, current } = params;
  if (current?.status === 'translated' && current.explicit !== true && mode !== 'auto') {
    return undefined;
  }
  return current;
}

export function resolveDisplayText(params: { original: string; result: IncomingResult; showingOriginal: boolean }): string {
  const { original, result, showingOriginal } = params;
  return result.status === 'translated' && !showingOriginal ? result.text : original;
}

export function resolveTranslationControl(params: {
  current: IncomingResult | undefined;
  cached: IncomingResult | undefined;
  requested: boolean;
  autoPending: boolean;
  assessment: IncomingAssessment | null;
  showingOriginal: boolean;
}): TranslationControl {
  const { current, cached, requested, autoPending, assessment, showingOriginal } = params;
  if (current?.status === 'translated') {
    return showingOriginal ? 'original' : 'translated';
  }
  if (current?.status === 'preparing' || (current === undefined && requested)) {
    return 'preparing';
  }
  if (current?.status === 'none' && cached?.status === 'none') {
    return 'none';
  }
  if (current === undefined && autoPending) {
    return 'none';
  }
  return isOfferable(assessment) ? 'offer' : 'none';
}

export function shouldAnnounceTranslation(params: { control: TranslationControl; result: IncomingResult }): boolean {
  const { control, result } = params;
  return control === 'translated' && result.status === 'translated' && result.explicit === true;
}
