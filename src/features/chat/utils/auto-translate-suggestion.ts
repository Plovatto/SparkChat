import type { IncomingAssessment } from '@lib/translation/incoming';
import type { TranslationMode } from './message-translation';

export const SUGGESTION_MIN_MANUAL_TRANSLATIONS = 2;
export const SUGGESTION_RECENT_WINDOW = 5;
export const SUGGESTION_MIN_OTHER_LANGUAGE = 3;

export function isSuggestionTriggered(params: { manualCount: number; assessments: IncomingAssessment[] }): boolean {
  const { manualCount, assessments } = params;
  if (manualCount >= SUGGESTION_MIN_MANUAL_TRANSLATIONS) {
    return true;
  }
  const recent = assessments.slice(-SUGGESTION_RECENT_WINDOW);
  return recent.filter((assessment) => assessment === 'other').length >= SUGGESTION_MIN_OTHER_LANGUAGE;
}

export function shouldShowAutoTranslateBanner(params: { mode: TranslationMode; dismissed: boolean; triggered: boolean }): boolean {
  const { mode, dismissed, triggered } = params;
  return mode === 'manual' && !dismissed && triggered;
}
