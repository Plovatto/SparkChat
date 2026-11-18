export function toLocalMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'blob:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
