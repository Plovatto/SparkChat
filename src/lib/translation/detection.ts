import type { Language } from '@lib/i18n/language';
import { detectPtEn, type DetectedLanguage } from './heuristic-detector';
import { TIMED_OUT, withNativeTimeout } from './native-timeout';
import { collapseStretchedLetters, translatableText } from './segments';

const MIN_PT_EN_SHARE = 0.2;
const DETECTOR_OPTIONS = { expectedInputLanguages: ['pt', 'en'] };

export interface DetectOptions {
  allowDownload?: boolean;
}

let detectorPromise: Promise<LanguageDetectorInstance> | null = null;
let detectorReady = false;
let backgroundStarted = false;

function normalize(tag: string): Language | null {
  const base = tag.toLowerCase().split('-')[0];
  return base === 'pt' || base === 'en' ? base : null;
}

function getDetector(): Promise<LanguageDetectorInstance> {
  if (!detectorPromise) {
    const creating = LanguageDetector!.create(DETECTOR_OPTIONS);
    detectorPromise = creating;
    creating.then(
      () => {
        if (detectorPromise === creating) {
          detectorReady = true;
        }
      },
      () => {
        if (detectorPromise === creating) {
          detectorPromise = null;
        }
      },
    );
  }
  return detectorPromise;
}

function startDetectorInBackground(): void {
  if (backgroundStarted || detectorPromise) {
    return;
  }
  backgroundStarted = true;
  getDetector().catch(() => undefined);
}

async function isDetectorReady(): Promise<boolean> {
  if (detectorReady) {
    return true;
  }
  if (detectorPromise || !LanguageDetector?.availability) {
    return false;
  }
  try {
    const result = await withNativeTimeout(LanguageDetector.availability(DETECTOR_OPTIONS));
    if (result === 'available') {
      return true;
    }
    if (result === 'downloadable' || result === 'downloading') {
      startDetectorInBackground();
    }
    return false;
  } catch {
    return false;
  }
}

export function resetDetectorForTests(): void {
  detectorPromise = null;
  detectorReady = false;
  backgroundStarted = false;
}

export async function detectLanguage(text: string, options: DetectOptions = {}): Promise<DetectedLanguage | null> {
  const input = collapseStretchedLetters(translatableText(text));
  if (typeof LanguageDetector === 'undefined') return detectPtEn(input);
  try {
    if (options.allowDownload === false && !(await isDetectorReady())) return detectPtEn(input);
    if (!detectorReady && detectorPromise) return detectPtEn(input);
    const detector = await withNativeTimeout(getDetector());
    if (detector === TIMED_OUT) {
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
