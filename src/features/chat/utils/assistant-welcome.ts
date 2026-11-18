import { appI18n } from '@lib/i18n/app-i18n';
import type { Language } from '@lib/i18n/language';

const WELCOME_KEY = 'chat.assistant.welcome';
const LANGUAGES: readonly Language[] = ['pt', 'en'];

function welcomeIn(language: Language): string {
  return appI18n.getFixedT(language)(WELCOME_KEY);
}

export function localizeAssistantWelcome(content: string, language: Language): string | null {
  const trimmed = content.trim();
  return LANGUAGES.some((candidate) => welcomeIn(candidate) === trimmed) ? welcomeIn(language) : null;
}
