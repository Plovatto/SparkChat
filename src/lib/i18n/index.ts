export { createI18n, type Namespace, type NamespaceResources } from './create-i18n';
export {
  CRAWLER_PATTERN,
  DEFAULT_LANGUAGE,
  HTML_LANG,
  LANGUAGES,
  OG_LOCALE,
  isLanguage,
  languageFromPath,
  pathForLanguage,
  resolvePreferredLanguage,
  type Language,
} from './language';
export { detectLanguage, readStoredLanguage, storeLanguage, systemLanguages } from './language-storage';
export { LanguageSwitch } from './LanguageSwitch';
