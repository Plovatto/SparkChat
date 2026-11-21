import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMOJI_CATEGORY_KEYS, localizeCategories } from './emoji-categories';
import { EMOJI_DATA_PATH, EMOJI_DATA_VERSION, emojiDataFiles, emojiDataLocaleFor } from './emoji-data-source';
import { SKIN_TONES, nextSkinTone, type EmojiSkinTone } from './skin-tone';

interface PackageJson {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) as T;
}

describe('self-hosted emoji data', () => {
  it('matches the pinned emojibase-data package so the files exist at build time', () => {
    const app = readJson<PackageJson>('package.json');
    expect(app.devDependencies?.['emojibase-data']).toBe(EMOJI_DATA_VERSION);
    expect(readJson<PackageJson>('node_modules/emojibase-data/package.json').version).toBe(EMOJI_DATA_VERSION);
    expect(app.dependencies?.frimousse).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is served from the app origin for every supported locale', () => {
    expect(EMOJI_DATA_PATH).toBe(`/emoji-data/${EMOJI_DATA_VERSION}`);
    expect(emojiDataFiles()).toEqual(['pt/data.json', 'pt/messages.json', 'en/data.json', 'en/messages.json']);
    expect(emojiDataLocaleFor('en')).toBe('en');
    expect(emojiDataLocaleFor('en-US')).toBe('en');
    expect(emojiDataLocaleFor('pt')).toBe('pt');
    expect(emojiDataLocaleFor('fr')).toBe('pt');
  });

  it('maps every emojibase group to a translated category except components', () => {
    const messages = readJson<{ groups: { key: string; order: number }[] }>('node_modules/emojibase-data/en/messages.json');
    const visible = messages.groups.filter((group) => group.key !== 'component');
    expect(visible.map((group) => EMOJI_CATEGORY_KEYS[group.order])).not.toContain(undefined);
    expect(
      localizeCategories(
        [
          { index: 0, label: 'x' },
          { index: 42, label: 'keep' },
        ],
        (key) => `t:${key}`,
      ),
    ).toEqual([
      { index: 0, label: 't:emoji.categories.smileys' },
      { index: 42, label: 'keep' },
    ]);
  });
});

describe('skin tone', () => {
  it('cycles through every tone and back', () => {
    let tone: EmojiSkinTone = 'none';
    const seen: EmojiSkinTone[] = [tone];
    for (let step = 1; step < SKIN_TONES.length; step += 1) {
      tone = nextSkinTone(tone);
      seen.push(tone);
    }
    expect(seen).toEqual([...SKIN_TONES]);
    expect(nextSkinTone(tone)).toBe('none');
  });
});
