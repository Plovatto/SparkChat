import type { Language } from '@lib/i18n/language';
import { detectPtEn, type DetectedLanguage } from './heuristic-detector';
import { TIMED_OUT, withNativeTimeout } from './native-timeout';
import { translatableText } from './segments';

const MIN_PT_EN_SHARE = 0.2;
const DETECTOR_OPTIONS = { expectedInputLanguages: ['pt', 'en'] };

export interface DetectOptions {
  allowDownload?: boolean;
}

let detectorPromise: Promise<LanguageDetectorInstance> | null = null;
let detectorHung = false;

function normalize(tag: string): Language | null {
  const base = tag.toLowerCase().split('-')[0];
  return base === 'pt' || base === 'en' ? base : null;
}

function getDetector(): Promise<LanguageDetectorInstance> {
  if (!detectorPromise) {
    detectorPromise = LanguageDetector!.create(DETECTOR_OPTIONS);
    detectorPromise.catch(() => {
      detectorPromise = null;
    });
  }
  return detectorPromise;
}

async function isDetectorReady(): Promise<boolean> {
  if (detectorPromise) {
    return true;
  }
  if (!LanguageDetector?.availability) {
    return false;
  }
  try {
    const result = await withNativeTimeout(LanguageDetector.availability(DETECTOR_OPTIONS));
    return result === 'available';
  } catch {
    return false;
  }
}

export function resetDetectorForTests(): void {
  detectorPromise = null;
  detectorHung = false;
}

export async function detectLanguage(text: string, options: DetectOptions = {}): Promise<DetectedLanguage | null> {
  const input = translatableText(text);
  if (typeof LanguageDetector === 'undefined' || detectorHung) return detectPtEn(input);
  try {
    if (options.allowDownload === false && !(await isDetectorReady())) return detectPtEn(input);
    const detector = await withNativeTimeout(getDetector());
    if (detector === TIMED_OUT) {
      detectorHung = true;
      return detectPtEn(input);
    }
    const results = await withNativeTimeout(detector.detect(input));
    if (results === TIMED_OUT) return detectPtEn(input);
    const scores = { pt: 0, en: 0 };
    for (const result of results) {
      const language = normalize(result.detectedLanguage);
      if (language) scores[language] += result.confidence;
    }
    const total = scores.pt + scores.en;
    if (total < MIN_PT_EN_SHARE) return detectPtEn(input);
    const language: Language = scores.pt >= scores.en ? 'pt' : 'en';
    return { language, confidence: scores[language] / total };
  } catch {
    return detectPtEn(input);
  }
}
