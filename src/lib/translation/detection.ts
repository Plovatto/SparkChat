import type { Language } from '@lib/i18n/language';
import { detectPtEn, type DetectedLanguage } from './heuristic-detector';
import { TIMED_OUT, withNativeTimeout } from './native-timeout';
import { translatableText } from './segments';

let detectorPromise: Promise<LanguageDetectorInstance> | null = null;
/** Set once create() never answered: the native detector is skipped for the rest of the session. */
let detectorHung = false;

function normalize(tag: string): Language | null {
  const base = tag.toLowerCase().split('-')[0];
  return base === 'pt' || base === 'en' ? base : null;
}

function getDetector(): Promise<LanguageDetectorInstance> {
  if (!detectorPromise) {
    detectorPromise = LanguageDetector!.create({ expectedInputLanguages: ['pt', 'en'] });
    detectorPromise.catch(() => {
      detectorPromise = null;
    });
  }
  return detectorPromise;
}

export function resetDetectorForTests(): void {
  detectorPromise = null;
  detectorHung = false;
}

export async function detectLanguage(text: string): Promise<DetectedLanguage | null> {
  const input = translatableText(text);
  if (typeof LanguageDetector === 'undefined' || detectorHung) return detectPtEn(input);
  try {
    const detector = await withNativeTimeout(getDetector());
    if (detector === TIMED_OUT) {
      detectorHung = true;
      return detectPtEn(input);
    }
    const results = await withNativeTimeout(detector.detect(input));
    if (results === TIMED_OUT) return detectPtEn(input);
    const top = results[0];
    if (!top) return null;
    const language = normalize(top.detectedLanguage);
    return language ? { language, confidence: top.confidence } : null;
  } catch {
    return detectPtEn(input);
  }
}
