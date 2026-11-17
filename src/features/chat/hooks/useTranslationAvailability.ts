import { useEffect, useState } from 'react';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { resolveEngine } from '@lib/translation';

/**
 * Whether incoming messages can be translated on this device. With `enabled` false (auto-translate off) nothing is
 * resolved at all, so no engine chunk is loaded and no cache is opened; the answer is then `true` (nothing to warn).
 */
export function useTranslationAvailability(enabled: boolean): boolean {
  const { language } = useAppLanguage();
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    if (!enabled) {
      return;
    }
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
  }, [enabled, language]);

  return !enabled || available;
}
