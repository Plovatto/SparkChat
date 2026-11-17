import { appI18n } from '@lib/i18n/app-i18n';
import type { Language } from '@lib/i18n/language';

const WELCOME_KEY = 'chat.assistant.welcome';
const LANGUAGES: readonly Language[] = ['pt', 'en'];

function welcomeIn(language: Language): string {
  return appI18n.getFixedT(language)(WELCOME_KEY);
}

/**
 * The SparkAI welcome is stored in the language the chat was created in. When a decrypted message is exactly one of
 * the two welcome texts, returns the one in `language`; otherwise null. Presentation only: nothing is re-sent or stored.
 */
export function localizeAssistantWelcome(content: string, language: Language): string | null {
  const trimmed = content.trim();
  return LANGUAGES.some((candidate) => welcomeIn(candidate) === trimmed) ? welcomeIn(language) : null;
}
