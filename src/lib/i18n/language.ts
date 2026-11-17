export const LANGUAGES = ['pt', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en';

export const HTML_LANG: Record<Language, string> = { pt: 'pt-BR', en: 'en' };

export const LANGUAGE_NATIVE_NAMES: Record<Language, string> = { pt: 'Português', en: 'English' };

export const OG_LOCALE: Record<Language, string> = { pt: 'pt_BR', en: 'en_US' };

export const LANGUAGE_PATHS: Record<Language, '/' | '/en/'> = { pt: '/', en: '/en/' };

export const CRAWLER_PATTERN = /bot|crawl|spider|slurp|inspectiontool|lighthouse|facebookexternalhit|whatsapp|preview/i;

export function isLanguage(value: unknown): value is Language {
  return value === 'pt' || value === 'en';
}

export function resolvePreferredLanguage(stored: string | null, system: readonly string[]): 'pt' | 'en' {
  if (stored === 'pt' || stored === 'en') {
    return stored;
  }
  for (const tag of system) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (code === 'pt' || code === 'en') {
      return code;
    }
  }
  return 'en';
}

export function languageFromPath(pathname: string): 'pt' | 'en' {
  return /^\/en(\/|$)/.test(pathname) ? 'en' : 'pt';
}

export function pathForLanguage(language: Language): '/' | '/en/' {
  return LANGUAGE_PATHS[language];
}

export function oppositeLanguage(language: Language): Language {
  return language === 'pt' ? 'en' : 'pt';
}
