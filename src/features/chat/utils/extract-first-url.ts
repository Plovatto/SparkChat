const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_PATTERN);
  if (!match) {
    return null;
  }

  return match[0].replace(/[)\].,!?]+$/, '');
}

export function removeFirstUrl(text: string): string {
  return text.replace(URL_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}
