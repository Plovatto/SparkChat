const URL_PATTERN = /https?:\/\/[^\s<>"']{1,2048}/i;
const TRAILING_URL_PUNCTUATION = new Set([')', ']', '.', ',', '!', '?']);

function trimTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0 && TRAILING_URL_PUNCTUATION.has(url.charAt(end - 1))) {
    end -= 1;
  }
  return url.slice(0, end);
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_PATTERN);
  if (!match) {
    return null;
  }

  return trimTrailingPunctuation(match[0]);
}

export function removeFirstUrl(text: string): string {
  return text.replace(URL_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}
