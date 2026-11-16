import { createInstance, type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { LANGUAGES, type Language } from './language';

export type Namespace = 'app' | 'landing' | 'themes';

export type NamespaceResources = Partial<Record<Namespace, Record<string, unknown>>>;

export function createI18n(language: Language, resources: Record<Language, NamespaceResources>, defaultNS: Namespace): i18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'pt',
    supportedLngs: LANGUAGES,
    ns: Object.keys(resources.pt),
    defaultNS,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
