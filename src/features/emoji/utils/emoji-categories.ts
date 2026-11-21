export const EMOJI_CATEGORY_KEYS: Readonly<Record<number, string>> = {
  0: 'smileys',
  1: 'people',
  3: 'animals',
  4: 'food',
  5: 'travel',
  6: 'activities',
  7: 'objects',
  8: 'symbols',
  9: 'flags',
};

export interface LabeledCategory {
  index: number;
  label: string;
}

export function localizeCategories<T extends LabeledCategory>(categories: readonly T[], translateKey: (key: string) => string): T[] {
  return categories.map((category) => {
    const key = EMOJI_CATEGORY_KEYS[category.index];
    return key ? { ...category, label: translateKey(`emoji.categories.${key}`) } : category;
  });
}
