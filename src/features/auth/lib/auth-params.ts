import { derivePasswordCredentials } from '@lib/e2ee';
import { fetchAuthParams, type AuthParams } from '../api/auth-api';

const store = new Map<string, AuthParams>();

export function rememberAuthParams(userId: string, params: AuthParams): void {
  store.set(userId, params);
}

export function forgetAuthParams(): void {
  store.clear();
}

export async function resolveAuthParams(userId: string, nickname: string): Promise<AuthParams> {
  const stored = store.get(userId);
  if (stored) {
    return stored;
  }
  const fetched = await fetchAuthParams(nickname);
  store.set(userId, fetched);
  return fetched;
}

export async function deriveCurrentPasswordProof(userId: string, nickname: string, password: string): Promise<string> {
  const params = await resolveAuthParams(userId, nickname);
  const { authKey, wrapKey } = await derivePasswordCredentials(password, params.salt);
  wrapKey.fill(0);
  return authKey;
}
