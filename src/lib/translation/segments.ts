import { isWholeMessageAbbreviation } from './abbreviations';

export type Segment = { kind: 'text' | 'protected'; value: string };

export const MIN_TRANSLATABLE_LETTERS = 2;
export const MAX_ANALYSED_TEXT_LENGTH = 4000;
export const MAX_ANALYSED_TOKEN_LENGTH = 256;

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
const LOWERCASE_LETTER = /\p{Ll}/u;
const UPPERCASE_LETTER = /\p{Lu}/u;
const LAUGHTER_TOKEN = /^k{2,}\P{L}*$/iu;
const TRAILING_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':', '…']);
const WHITESPACE = /\s/;

function stripTrailingPunctuation(token: string): string {
  let end = token.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(token.charAt(end - 1))) end -= 1;
  return token.slice(0, end);
}

export function isUppercaseWord(word: string): boolean {
  let uppercase = 0;
  for (const char of word) {
    if (LOWERCASE_LETTER.test(char)) return false;
    if (UPPERCASE_LETTER.test(char)) uppercase += 1;
  }
  return uppercase >= 2;
}

function keepsStretchedLetters(token: string): boolean {
  if (token.length > MAX_ANALYSED_TOKEN_LENGTH) return false;
  const word = stripTrailingPunctuation(token);
  return NOT_A_WORD.test(word) || isUppercaseWord(word) || LAUGHTER_TOKEN.test(word);
}

export function collapseStretchedLetters(text: string): string {
  return text.replace(/\S+/g, (token) => (keepsStretchedLetters(token) ? token : token.replace(STRETCHED_LETTERS, '$1')));
}

function leadingWhitespaceLength(value: string): number {
  let start = 0;
  while (start < value.length && WHITESPACE.test(value.charAt(start))) start += 1;
  return start;
}

function trailingWhitespaceStart(value: string, floor: number): number {
  let end = value.length;
  while (end > floor && WHITESPACE.test(value.charAt(end - 1))) end -= 1;
  return end;
}

export function translatableText(text: string): string {
  return splitSegments(text)
    .filter((segment) => segment.kind === 'text')
    .map((segment) => segment.value)
    .join('');
}

export function hasTranslatableText(text: string): boolean {
  const translatable = translatableText(text.slice(0, MAX_ANALYSED_TEXT_LENGTH));
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
      const start = leadingWhitespaceLength(segment.value);
      const end = trailingWhitespaceStart(segment.value, start);
      const core = segment.value.slice(start, end);
      return `${segment.value.slice(0, start)}${await translate(core)}${segment.value.slice(end)}`;
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
