import type { IncomingResult } from '@lib/translation/incoming';

export type TranslationBadgeState = 'translated' | 'original' | 'preparing' | 'none';

export interface FetchedTranslation {
  key: string;
  result: IncomingResult;
}

export function hasText(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.trim() !== '';
}

export function shouldRequestTranslation(params: {
  enabled: boolean;
  isVisible: boolean;
  text: string | null | undefined;
  current: IncomingResult | undefined;
}): boolean {
  const { enabled, isVisible, text, current } = params;
  if (!enabled || !isVisible || !hasText(text)) {
    return false;
  }
  return current === undefined || current.status === 'preparing';
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

export function resolveDisplayText(params: { original: string; result: IncomingResult; showingOriginal: boolean }): string {
  const { original, result, showingOriginal } = params;
  return result.status === 'translated' && !showingOriginal ? result.text : original;
}

export function resolveBadgeState(result: IncomingResult, showingOriginal: boolean): TranslationBadgeState {
  if (result.status === 'translated') {
    return showingOriginal ? 'original' : 'translated';
  }
  return result.status;
}
