type TranslatorAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface TranslatorDownloadProgressEvent extends Event {
  readonly loaded: number;
}

interface TranslatorMonitor extends EventTarget {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: TranslatorDownloadProgressEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

interface TranslatorLanguagePair {
  sourceLanguage: string;
  targetLanguage: string;
}

interface TranslatorCreateOptions extends TranslatorLanguagePair {
  monitor?: (monitor: TranslatorMonitor) => void;
  signal?: AbortSignal;
}

interface TranslatorInstance {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?(): void;
}

interface TranslatorStatic {
  availability(options: TranslatorLanguagePair): Promise<TranslatorAvailability>;
  create(options: TranslatorCreateOptions): Promise<TranslatorInstance>;
}

declare const Translator: TranslatorStatic | undefined;

interface LanguageDetectionResult {
  detectedLanguage: string;
  confidence: number;
}

interface LanguageDetectorInstance {
  detect(text: string, options?: { signal?: AbortSignal }): Promise<LanguageDetectionResult[]>;
  destroy?(): void;
}

interface LanguageDetectorStatic {
  availability?(options?: { expectedInputLanguages?: string[] }): Promise<TranslatorAvailability>;
  create(options?: { expectedInputLanguages?: string[]; signal?: AbortSignal }): Promise<LanguageDetectorInstance>;
}

declare const LanguageDetector: LanguageDetectorStatic | undefined;
