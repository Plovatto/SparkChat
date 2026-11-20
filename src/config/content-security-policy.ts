export const WALLPAPER_IMAGE_ORIGINS = ['https://images.unsplash.com', 'https://plus.unsplash.com'] as const;

export interface ContentSecurityPolicyOptions {
  apiUrl?: string | undefined;
  socketUrl?: string | undefined;
  mediaOrigin?: string | undefined;
  translationModelsUrl?: string | undefined;
  keyTransparencyWitnessUrl?: string | undefined;
  scriptHashes?: readonly string[];
}

function originOf(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function socketOriginsOf(value: string | undefined): string[] {
  const origin = originOf(value);
  if (!origin) {
    return [];
  }
  const websocket = origin.replace(/^http/, 'ws');
  return [origin, websocket];
}

function unique(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function buildContentSecurityPolicy(options: ContentSecurityPolicyOptions = {}): string {
  const mediaOrigin = originOf(options.mediaOrigin) ?? 'https:';
  const scriptHashes = (options.scriptHashes ?? []).map((hash) => `'${hash}'`);

  const directives: Record<string, readonly string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'wasm-unsafe-eval'", ...scriptHashes],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'blob:', 'data:', ...WALLPAPER_IMAGE_ORIGINS],
    'font-src': ["'self'", 'data:'],
    'media-src': ["'self'", 'blob:'],
    'connect-src': unique([
      "'self'",
      'blob:',
      ...socketOriginsOf(options.apiUrl),
      ...socketOriginsOf(options.socketUrl),
      mediaOrigin,
      originOf(options.translationModelsUrl),
      originOf(options.keyTransparencyWitnessUrl),
    ]),
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

export function contentSecurityPolicyMetaTag(policy: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${policy.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" />`;
}
