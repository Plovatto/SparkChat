import { derivePasswordCredentials } from '@lib/e2ee';
import type { AuthVersion } from '@lib/socket';
import { fetchAuthParams, type AuthParams } from '../api/auth-api';

type StoredAuthParams = { version: 1 } | { version: 2; salt?: string };

const store = new Map<string, StoredAuthParams>();

export function rememberAuthParams(userId: string, params: StoredAuthParams): void {
  store.set(userId, params);
}

export function rememberAuthVersion(userId: string, version: AuthVersion): void {
  const existing = store.get(userId);
  if (existing?.version === version) {
    return;
  }
  store.set(userId, version === 1 ? { version: 1 } : { version: 2 });
}

export function forgetAuthParams(): void {
  store.clear();
}

export async function resolveAuthParams(userId: string, nickname: string): Promise<AuthParams> {
  const stored = store.get(userId);
  if (stored?.version === 1) {
    return stored;
  }
  if (stored?.version === 2 && stored.salt) {
    return { version: 2, salt: stored.salt };
  }
  const fetched = await fetchAuthParams(nickname);
  store.set(userId, fetched);
  return fetched;
}

export async function deriveCurrentPasswordProof(userId: string, nickname: string, password: string): Promise<{ proof: string; params: AuthParams }> {
  const params = await resolveAuthParams(userId, nickname);
  if (params.version === 1) {
    return { proof: password, params };
  }
  const { authKey, wrapKey } = await derivePasswordCredentials(password, params.salt);
  wrapKey.fill(0);
  return { proof: authKey, params };
}
