import type { MessageView } from '@lib/socket';

export const MESSAGE_SEARCH_LIMIT = 50;
export const MESSAGE_SEARCH_MIN_LENGTH = 2;

export interface MessageSearchResult {
  message: MessageView;
  text: string;
  matchStart: number;
  matchLength: number;
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function searchableText(message: MessageView): string | null {
  if (message.deletedForEveryone || message.systemEvent) {
    return null;
  }
  if (message.type === 'text') {
    return message.content;
  }
  return message.caption ?? null;
}

function foldedIndex(text: string, needle: string): { start: number; length: number } | null {
  const chars = Array.from(text);
  const folded = chars.map((char) => fold(char));
  const joined = folded.join('');
  const position = joined.indexOf(needle);
  if (position === -1) {
    return null;
  }
  let offset = 0;
  let start = -1;
  let end = chars.length;
  for (let index = 0; index < chars.length; index += 1) {
    if (start === -1 && offset >= position) {
      start = index;
    }
    offset += folded[index]?.length ?? 0;
    if (start !== -1 && offset >= position + needle.length) {
      end = index + 1;
      break;
    }
  }
  const prefix = chars.slice(0, Math.max(start, 0)).join('');
  const match = chars.slice(Math.max(start, 0), end).join('');
  return { start: prefix.length, length: match.length };
}

export function searchMessages(messages: readonly MessageView[], query: string): MessageSearchResult[] {
  const needle = fold(query.trim());
  if (needle.length < MESSAGE_SEARCH_MIN_LENGTH) {
    return [];
  }
  const results: MessageSearchResult[] = [];
  for (const message of [...messages].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())) {
    const text = searchableText(message);
    if (!text) {
      continue;
    }
    const match = foldedIndex(text, needle);
    if (match) {
      results.push({ message, text, matchStart: match.start, matchLength: match.length });
      if (results.length === MESSAGE_SEARCH_LIMIT) {
        break;
      }
    }
  }
  return results;
}
