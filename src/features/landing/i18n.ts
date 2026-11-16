import type { i18n } from 'i18next';
import { createI18n, type Language } from '@lib/i18n';
import enLanding from '@/locales/en/landing.json';
import enThemes from '@/locales/en/themes.json';
import ptLanding from '@/locales/pt/landing.json';
import ptThemes from '@/locales/pt/themes.json';

export function createLandingI18n(language: Language): i18n {
  return createI18n(
    language,
    {
      pt: { landing: ptLanding, themes: ptThemes },
      en: { landing: enLanding, themes: enThemes },
    },
    'landing',
  );
}
