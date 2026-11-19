const OPENABLE_PROTOCOLS = new Set(['http:', 'https:']);

export function resolveLinkPreviewTarget(url: string, messageText: string): string | null {
  if (!url || !messageText.includes(url)) {
    return null;
  }

  try {
    return OPENABLE_PROTOCOLS.has(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}

export function hasDisplayableLinkPreviewImage(imageUrl: string | null): imageUrl is string {
  return Boolean(imageUrl?.startsWith('blob:'));
}
