import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { HTML_LANG, isLanguage, pathForLanguage, storeLanguage, type Language } from '@lib/i18n';
import { runLanguageTransition } from '@lib/i18n/language-transition';

export function useLandingLanguage(): { language: Language; changeLanguage: (language: Language) => void } {
  const { i18n } = useTranslation('landing');
  const language: Language = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'pt';

  const changeLanguage = useCallback(
    (next: Language) => {
      const t = i18n.getFixedT(next, 'landing');
      const { search, hash } = window.location;
      storeLanguage(next);
      window.history.replaceState(window.history.state, '', `${pathForLanguage(next)}${search}${hash}`);
      document.documentElement.lang = HTML_LANG[next];
      document.title = t('meta.title');
      document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
      void runLanguageTransition(() => i18n.changeLanguage(next));
    },
    [i18n],
  );

  return { language, changeLanguage };
}
