import type { IncomingResult } from '@lib/translation/incoming';

export type TranslationBadgeState = 'translated' | 'original' | 'preparing' | 'none';

export interface FetchedTranslation {
  key: string;
  result: IncomingResult;
}

export function hasText(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.trim() !== '';
}

/** Only visible messages are translated; `preparing` keeps the request alive until the model is ready. */
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

/** A fetched result only counts for the request that produced it; otherwise the synchronous cache read decides. */
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
  return fetched?.key === key ? fetched.result : cached;
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
