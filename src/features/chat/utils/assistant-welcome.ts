import { appI18n } from '@lib/i18n/app-i18n';
import type { Language } from '@lib/i18n/language';

const WELCOME_KEYS = ['chat.assistant.welcome', 'chat.assistant.welcomeLegacy'] as const;
const LANGUAGES: readonly Language[] = ['pt', 'en'];

type WelcomeKey = (typeof WELCOME_KEYS)[number];

function welcomeIn(language: Language, key: WelcomeKey): string {
  return appI18n.getFixedT(language)(key);
}

export function localizeAssistantWelcome(content: string, language: Language): string | null {
  const trimmed = content.trim();
  const matched = WELCOME_KEYS.find((key) => LANGUAGES.some((candidate) => welcomeIn(candidate, key) === trimmed));
  return matched ? welcomeIn(language, matched) : null;
}
