import { useEffect, useState } from 'react';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { resolveEngine } from '@lib/translation';

export function useTranslationAvailability(): boolean {
  const { language } = useAppLanguage();
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const source = language === 'pt' ? 'en' : 'pt';
    resolveEngine(source, language)
      .then((route) => {
        if (!cancelled) {
          setAvailable(route !== null && route.support !== 'unavailable');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailable(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  return available;
}
