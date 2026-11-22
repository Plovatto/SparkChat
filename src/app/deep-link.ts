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

function zeroInviteIntent(intent: DeepLinkIntent | undefined): void {
  if (intent?.kind === 'invite') {
    intent.secret.fill(0);
  }
}

export function withInviteIntent(previous: DeepLinkIntent[], invite: Extract<DeepLinkIntent, { kind: 'invite' }>): DeepLinkIntent[] {
  for (const intent of previous) {
    if (intent.kind === 'invite' && intent.secret !== invite.secret) {
      zeroInviteIntent(intent);
    }
  }
  return [...previous.filter((intent) => intent.kind !== 'invite'), invite];
}

export function withoutFirstIntent(previous: DeepLinkIntent[]): DeepLinkIntent[] {
  zeroInviteIntent(previous[0]);
  return previous.slice(1);
}

const DEEP_LINK_EVENT: Record<DeepLinkIntent['kind'], string> = {
  invite: 'room:join-by-invite',
  chat: 'room:create-private',
};

export function isDeepLinkError(payload: { code?: string; clientTempId?: string; event?: string }, intent: DeepLinkIntent): boolean {
  if (payload.clientTempId) {
    return false;
  }
  return !payload.event || payload.event === DEEP_LINK_EVENT[intent.kind];
}
