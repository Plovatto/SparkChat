import type { GifLocale } from '@lib/api/gifs';
import type { Language } from '@lib/i18n/language';

export function gifLocaleFor(language: Language): GifLocale {
  return language === 'en' ? 'us' : 'br';
}
