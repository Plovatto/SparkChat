import type { Language } from '@lib/i18n/language';
import { detectPtEn, type DetectedLanguage } from './heuristic-detector';
import { translatableText } from './segments';

let detectorPromise: Promise<LanguageDetectorInstance> | null = null;

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
}

export async function detectLanguage(text: string): Promise<DetectedLanguage | null> {
  const input = translatableText(text);
  if (typeof LanguageDetector === 'undefined') return detectPtEn(input);
  try {
    const top = (await (await getDetector()).detect(input))[0];
    if (!top) return null;
    const language = normalize(top.detectedLanguage);
    return language ? { language, confidence: top.confidence } : null;
  } catch {
    return detectPtEn(input);
  }
}
