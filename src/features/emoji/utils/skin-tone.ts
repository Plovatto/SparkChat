export const SKIN_TONES = ['none', 'light', 'medium-light', 'medium', 'medium-dark', 'dark'] as const;

export type EmojiSkinTone = (typeof SKIN_TONES)[number];

export const SKIN_TONE_PREVIEW: Readonly<Record<EmojiSkinTone, string>> = {
  none: '\u{270B}',
  light: '\u{270B}\u{1F3FB}',
  'medium-light': '\u{270B}\u{1F3FC}',
  medium: '\u{270B}\u{1F3FD}',
  'medium-dark': '\u{270B}\u{1F3FE}',
  dark: '\u{270B}\u{1F3FF}',
};

export const SKIN_TONE_STORAGE_KEY = 'sparkchat:emoji-skin-tone';

function isSkinTone(value: unknown): value is EmojiSkinTone {
  return typeof value === 'string' && (SKIN_TONES as readonly string[]).includes(value);
}

export function readSkinTone(): EmojiSkinTone {
  try {
    const stored = window.localStorage.getItem(SKIN_TONE_STORAGE_KEY);
    return isSkinTone(stored) ? stored : 'none';
  } catch {
    return 'none';
  }
}

export function saveSkinTone(tone: EmojiSkinTone): void {
  try {
    window.localStorage.setItem(SKIN_TONE_STORAGE_KEY, tone);
  } catch {
    return;
  }
}

export function nextSkinTone(tone: EmojiSkinTone): EmojiSkinTone {
  const index = SKIN_TONES.indexOf(tone);
  return SKIN_TONES[(index + 1) % SKIN_TONES.length] ?? 'none';
}
