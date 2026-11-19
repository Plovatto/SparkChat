export type DeepLinkIntent = { kind: 'join'; code: string } | { kind: 'chat'; nickname: string };

export const DEEP_LINK_PARAMS = ['join', 'startChat'] as const;
export const MAX_DEEP_LINK_VALUE_LENGTH = 64;

function readParam(params: URLSearchParams, name: string): string | null {
  const value = params.get(name)?.trim();
  if (!value || value.length > MAX_DEEP_LINK_VALUE_LENGTH) {
    return null;
  }
  return value;
}

export function hasDeepLinkParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return DEEP_LINK_PARAMS.some((name) => params.has(name));
}

export function readDeepLinkIntents(search: string, ownNickname: string): DeepLinkIntent[] {
  const params = new URLSearchParams(search);
  const intents: DeepLinkIntent[] = [];

  const nickname = readParam(params, 'startChat');
  if (nickname && nickname.toLowerCase() !== ownNickname.toLowerCase()) {
    intents.push({ kind: 'chat', nickname });
  }

  const code = readParam(params, 'join');
  if (code) {
    intents.push({ kind: 'join', code: code.toUpperCase() });
  }

  return intents;
}
