export const EMOJI_DATA_VERSION = '17.0.0';

export const EMOJI_DATA_PATH = `/emoji-data/${EMOJI_DATA_VERSION}`;

export const EMOJI_DATA_LOCALES = ['pt', 'en'] as const;

export type EmojiDataLocale = (typeof EMOJI_DATA_LOCALES)[number];

export const EMOJI_DATA_FILES = ['data.json', 'messages.json'] as const;

export function emojiDataFiles(): string[] {
  return EMOJI_DATA_LOCALES.flatMap((locale) => EMOJI_DATA_FILES.map((file) => `${locale}/${file}`));
}

export function emojiDataLocaleFor(language: string): EmojiDataLocale {
  return language.toLowerCase().startsWith('en') ? 'en' : 'pt';
}
