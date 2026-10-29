const SAFE_MEDIA_PROTOCOLS = new Set(['https:', 'blob:']);

export function toSafeMediaUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return SAFE_MEDIA_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
