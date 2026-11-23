import { detectByWords, rankLanguages, type DetectedLanguage } from './heuristic-detector';
import { TIMED_OUT, withNativeTimeout } from './native-timeout';
import type { SourceLanguage } from './types';
import { collapseStretchedLetters, MAX_ANALYSED_TEXT_LENGTH, translatableText } from './segments';

const MIN_NATIVE_CONFIDENCE = 0.6;
const DETECTOR_OPTIONS = { expectedInputLanguages: ['pt', 'en', 'es'] };
const SHORT_TEXT_WORDS = 4;

export interface DetectOptions {
  allowDownload?: boolean;
}

let detectorPromise: Promise<LanguageDetectorInstance> | null = null;
let detectorReady = false;
let backgroundStarted = false;
let createTimedOut = false;

function normalize(tag: string): SourceLanguage | null {
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return base === 'pt' || base === 'en' || base === 'es' ? base : null;
}

function isShortText(text: string): boolean {
  return (text.match(/\p{L}+/gu)?.length ?? 0) < SHORT_TEXT_WORDS;
}

function getDetector(): Promise<LanguageDetectorInstance> {
  if (!detectorPromise) {
    const creating = LanguageDetector!.create(DETECTOR_OPTIONS);
    detectorPromise = creating;
    creating.then(
      () => {
        if (detectorPromise === creating) {
          detectorReady = true;
          createTimedOut = false;
        }
      },
      () => {
        if (detectorPromise === creating) {
          detectorPromise = null;
          createTimedOut = false;
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
  if (detectorPromise) {
    if (backgroundStarted || createTimedOut) {
      return false;
    }
    try {
      if ((await withNativeTimeout(detectorPromise)) === TIMED_OUT) {
        createTimedOut = true;
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
  if (!LanguageDetector?.availability) {
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
  createTimedOut = false;
}

export async function detectLanguage(text: string, options: DetectOptions = {}): Promise<DetectedLanguage | null> {
  const input = collapseStretchedLetters(translatableText(text.slice(0, MAX_ANALYSED_TEXT_LENGTH)));
  if (typeof LanguageDetector === 'undefined') return detectByWords(input);
  try {
    if (options.allowDownload === false && !(await isDetectorReady())) return detectByWords(input);
    if (!detectorReady && detectorPromise && (backgroundStarted || createTimedOut)) return detectByWords(input);
    const detector = await withNativeTimeout(getDetector());
    if (detector === TIMED_OUT) {
      createTimedOut = true;
      return detectByWords(input);
    }
    const results = await withNativeTimeout(detector.detect(input));
    if (results === TIMED_OUT) return detectByWords(input);
    const scores: Record<SourceLanguage, number> = { pt: 0, en: 0, es: 0 };
    for (const result of results) {
      const language = normalize(result.detectedLanguage);
      if (language) scores[language] += result.confidence;
    }
    const [language, other] = rankLanguages(scores);
    if (scores[language] < MIN_NATIVE_CONFIDENCE) return detectByWords(input);
    if (language === 'es' && isShortText(input)) {
      const heuristic = detectByWords(input);
      if (heuristic?.language !== 'es') return heuristic;
    }
    return { language, confidence: Math.min(1, scores[language] - scores[other]) };
  } catch {
    return detectByWords(input);
  }
}
