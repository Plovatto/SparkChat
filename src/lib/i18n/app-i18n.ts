import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import enApp from '@/locales/en/app.json';
import enThemes from '@/locales/en/themes.json';
import ptApp from '@/locales/pt/app.json';
import ptThemes from '@/locales/pt/themes.json';
import { createI18n } from './create-i18n';
import { HTML_LANG, isLanguage, type Language } from './language';
import { detectLanguage, storeLanguage } from './language-storage';
import { runLanguageTransition } from './language-transition';

export const appI18n = createI18n(
  typeof window === 'undefined' ? 'pt' : detectLanguage(),
  {
    pt: { app: ptApp, themes: ptThemes },
    en: { app: enApp, themes: enThemes },
  },
  'app',
);

function syncDocumentLanguage(language: Language): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = HTML_LANG[language];
  }
}

syncDocumentLanguage(currentLanguage());

export function currentLanguage(): Language {
  return isLanguage(appI18n.resolvedLanguage) ? appI18n.resolvedLanguage : 'pt';
}

export function changeAppLanguage(language: Language): void {
  storeLanguage(language);
  syncDocumentLanguage(language);
  void runLanguageTransition(() => appI18n.changeLanguage(language));
}

export function translate(key: string, options?: Record<string, unknown>): string {
  return (appI18n.t as unknown as (key: string, options?: Record<string, unknown>) => string)(key, options);
}

export function hasTranslation(key: string): boolean {
  return appI18n.exists(key);
}

export function useOnLanguageChange(callback: () => void): void {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    const handler = () => latest.current();
    appI18n.on('languageChanged', handler);
    return () => appI18n.off('languageChanged', handler);
  }, []);
}

export function useAppLanguage(): { language: Language; changeLanguage: (language: Language) => void } {
  const { i18n } = useTranslation();
  const language: Language = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'pt';
  const changeLanguage = useCallback((next: Language) => changeAppLanguage(next), []);
  return { language, changeLanguage };
}
