export type Segment = { kind: 'text' | 'protected'; value: string };

export const MIN_TRANSLATABLE_LETTERS = 4;

const PROTECTED_PATTERN = /(https?:\/\/\S+|@[\p{L}\p{N}_]+)/gu;
const LAUGHTER_WORD = /^(k{3,}|(ha){2,}|(he){2,}|(rs)+|lol|lmao)$/i;
const LETTER = /\p{L}/gu;

export function splitSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  text.split(PROTECTED_PATTERN).forEach((value, index) => {
    if (value === '') return;
    segments.push({ kind: index % 2 === 1 ? 'protected' : 'text', value });
  });
  return segments;
}

export function translatableText(text: string): string {
  return splitSegments(text)
    .filter((segment) => segment.kind === 'text')
    .map((segment) => segment.value)
    .join('');
}

export function hasTranslatableText(text: string): boolean {
  let letters = 0;
  for (const word of translatableText(text).split(/\s+/)) {
    if (!word || LAUGHTER_WORD.test(word.replace(/[^\p{L}\p{N}]/gu, ''))) continue;
    letters += word.match(LETTER)?.length ?? 0;
  }
  return letters >= MIN_TRANSLATABLE_LETTERS;
}

export async function translatePreservingSegments(
  text: string,
  translate: (chunk: string) => Promise<string>,
): Promise<string> {
  const parts = await Promise.all(
    splitSegments(text).map(async (segment) => {
      if (segment.kind === 'protected' || !/\p{L}/u.test(segment.value)) return segment.value;
      const lead = segment.value.match(/^\s*/)?.[0] ?? '';
      const trail = segment.value.match(/\s*$/)?.[0] ?? '';
      const core = segment.value.slice(lead.length, segment.value.length - trail.length);
      return `${lead}${await translate(core)}${trail}`;
    }),
  );
  return parts.join('');
}
