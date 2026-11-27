export function isAndroidBrowser(userAgent: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.userAgent): boolean {
  return typeof userAgent === 'string' && /Android/i.test(userAgent);
}
