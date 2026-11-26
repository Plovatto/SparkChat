import { appI18n } from '@lib/i18n/app-i18n';
import type { Language } from '@lib/i18n/language';

const WELCOME_KEYS = ['chat.assistant.welcome', 'chat.assistant.welcomeLegacy'] as const;
const LANGUAGES: readonly Language[] = ['pt', 'en'];

function welcomesIn(language: Language): string[] {
  const t = appI18n.getFixedT(language);
  return WELCOME_KEYS.map((key) => t(key));
}

export function localizeAssistantWelcome(content: string, language: Language): string | null {
  const trimmed = content.trim();
  return LANGUAGES.some((candidate) => welcomesIn(candidate).includes(trimmed)) ? welcomesIn(language)[0]! : null;
}
