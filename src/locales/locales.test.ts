import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CHAT_BACKGROUNDS } from '@features/theme/constants/chat-backgrounds';
import { COLOR_THEMES } from '@features/theme/constants/color-themes';
import { THEME_BASES } from '@features/theme/constants/theme-bases';
import enApp from './en/app.json';
import enLanding from './en/landing.json';
import enThemes from './en/themes.json';
import ptApp from './pt/app.json';
import ptLanding from './pt/landing.json';
import ptThemes from './pt/themes.json';

type Translations = { [key: string]: string | Translations };

function flatten(translations: Translations, prefix = ''): Map<string, string> {
  return new Map(
    Object.entries(translations).flatMap(([key, value]) =>
      typeof value === 'string' ? [[`${prefix}${key}`, value] as const] : [...flatten(value, `${prefix}${key}.`)],
    ),
  );
}

function placeholders(text: string): string[] {
  return (text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((match) => match.replace(/\s/g, '')).sort();
}

const NAMESPACES = {
  app: [ptApp, enApp],
  landing: [ptLanding, enLanding],
  themes: [ptThemes, enThemes],
} as const;

describe.each(Object.entries(NAMESPACES))('%s translations', (_name, [pt, en]) => {
  const ptKeys = flatten(pt);
  const enKeys = flatten(en);

  it('have the same keys in Portuguese and English', () => {
    expect([...enKeys.keys()].sort()).toEqual([...ptKeys.keys()].sort());
  });

  it('never have empty texts and keep the same placeholders in both languages', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ptKeys.keys()), (key) => {
        const ptText = ptKeys.get(key) ?? '';
        const enText = enKeys.get(key) ?? '';
        expect(ptText.trim()).not.toBe('');
        expect(enText.trim()).not.toBe('');
        expect(placeholders(enText)).toEqual(placeholders(ptText));
      }),
      { numRuns: ptKeys.size * 4 },
    );
  });
});

describe('theme names', () => {
  it('cover every color theme, base and wallpaper', () => {
    for (const themes of [ptThemes, enThemes]) {
      expect(Object.keys(themes.colors).sort()).toEqual(Object.keys(COLOR_THEMES).sort());
      expect(Object.keys(themes.bases).sort()).toEqual(Object.keys(THEME_BASES).sort());
      expect(Object.keys(themes.wallpapers).sort()).toEqual(CHAT_BACKGROUNDS.map((background) => background.id).sort());
    }
  });
});

describe('removed call options', () => {
  it('no longer offer the protect my IP option for calls', () => {
    for (const app of [ptApp, enApp]) {
      const keys = [...flatten(app).keys()];
      expect(keys).not.toContain('profile.callProtectIp');
      expect(keys.filter((key) => key.endsWith('.relay-unavailable'))).toEqual([]);
    }
  });
});
