import { isWholeMessageAbbreviation } from './abbreviations';

export type Segment = { kind: 'text' | 'protected'; value: string };

export const MIN_TRANSLATABLE_LETTERS = 2;

const PROTECTED_PATTERN = /(https?:\/\/\S+|@[\p{L}\p{N}_]+)/gu;
const LAUGHTER_WORD = /^(k{2,}|(ha){2,}|(he){2,}|(rs)+|lol|lmao)$/i;
const LETTER = /\p{L}/gu;
const LINE_BREAK = /(\r?\n)/;

export function splitSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  text.split(PROTECTED_PATTERN).forEach((value, index) => {
    if (value === '') return;
    segments.push({ kind: index % 2 === 1 ? 'protected' : 'text', value });
  });
  return segments;
}

const STRETCHED_LETTERS = /(\p{L})\1{2,}/giu;
const MAX_FILLER_LETTERS = 2;

const NOT_A_WORD = /[.@/:\d]/;
const UPPERCASE_WORD = /^[^\p{Ll}]*\p{Lu}[^\p{Ll}]*\p{Lu}[^\p{Ll}]*$/u;
const LAUGHTER_TOKEN = /^k{2,}\P{L}*$/iu;

const TRAILING_PUNCTUATION = /[.,!?;:…]+$/u;

function keepsStretchedLetters(token: string): boolean {
  const word = token.replace(TRAILING_PUNCTUATION, '');
  return NOT_A_WORD.test(word) || UPPERCASE_WORD.test(word) || LAUGHTER_TOKEN.test(word);
}

export function collapseStretchedLetters(text: string): string {
  return text.replace(/\S+/g, (token) => (keepsStretchedLetters(token) ? token : token.replace(STRETCHED_LETTERS, '$1')));
}

export function translatableText(text: string): string {
  return splitSegments(text)
    .filter((segment) => segment.kind === 'text')
    .map((segment) => segment.value)
    .join('');
}

export function hasTranslatableText(text: string): boolean {
  const translatable = translatableText(text);
  if (isWholeMessageAbbreviation(translatable)) return true;
  let letters = 0;
  for (const word of translatable.split(/\s+/)) {
    const cleaned = word.replace(/[^\p{L}\p{N}]/gu, '');
    if (!cleaned || LAUGHTER_WORD.test(cleaned)) continue;
    const collapsed = collapseStretchedLetters(cleaned);
    const collapsedLetters = collapsed.match(LETTER)?.length ?? 0;
    if (collapsed !== cleaned && collapsedLetters <= MAX_FILLER_LETTERS) continue;
    letters += collapsedLetters;
  }
  return letters >= MIN_TRANSLATABLE_LETTERS;
}

async function translateLine(line: string, translate: (chunk: string) => Promise<string>): Promise<string> {
  const parts = await Promise.all(
    splitSegments(line).map(async (segment) => {
      if (segment.kind === 'protected' || !/\p{L}/u.test(segment.value)) return segment.value;
      const lead = segment.value.match(/^\s*/)?.[0] ?? '';
      const trail = segment.value.match(/\s*$/)?.[0] ?? '';
      const core = segment.value.slice(lead.length, segment.value.length - trail.length);
      return `${lead}${await translate(core)}${trail}`;
    }),
  );
  return parts.join('');
}

export async function translatePreservingSegments(
  text: string,
  translate: (chunk: string) => Promise<string>,
): Promise<string> {
  const lines = await Promise.all(
    text.split(LINE_BREAK).map((part, index) => (index % 2 === 1 ? Promise.resolve(part) : translateLine(part, translate))),
  );
  return lines.join('');
}
