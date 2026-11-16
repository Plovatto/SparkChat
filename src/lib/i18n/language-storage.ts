import { LANGUAGE_STORAGE_KEY } from '@constants/storage-keys';
import { resolvePreferredLanguage, type Language } from './language';

export function readStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeLanguage(language: Language): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    return;
  }
}

export function systemLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

export function detectLanguage(): Language {
  return resolvePreferredLanguage(readStoredLanguage(), systemLanguages());
}
