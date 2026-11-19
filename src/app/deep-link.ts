export type DeepLinkIntent = { kind: 'invite'; roomId: string; secret: Uint8Array } | { kind: 'chat'; nickname: string };

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
  const nickname = readParam(params, 'startChat');
  if (nickname && nickname.toLowerCase() !== ownNickname.toLowerCase()) {
    return [{ kind: 'chat', nickname }];
  }
  return [];
}
