import { ApiError } from '@lib/api/api-error';
import { derivePasswordCredentials, deriveRecoveryCredentials, parseRecoveryFile, type RecoveryFileContents } from '@lib/e2ee';
import { fetchAuthParams, login, loginWithRecovery } from '../api/auth-api';
import type { PendingE2eCredential, User } from '../types';
import { rememberAuthParams } from './auth-params';

export interface LoginOutcome {
  user: User;
  credential: PendingE2eCredential;
}

export async function loginWithPassword(nickname: string, password: string): Promise<LoginOutcome> {
  const params = await fetchAuthParams(nickname);
  const { authKey, wrapKey } = await derivePasswordCredentials(password, params.salt);
  try {
    const { user } = await login({ nickname, password: authKey });
    rememberAuthParams(user.id, { version: 2, salt: params.salt });
    return { user, credential: { type: 'password-v2', wrapKey } };
  } catch (error) {
    wrapKey.fill(0);
    throw error;
  }
}

async function readRecoveryFile(file: File): Promise<RecoveryFileContents> {
  try {
    return await parseRecoveryFile(await file.text());
  } catch {
    throw new ApiError({ code: 'auth.keyfileInvalid' }, 'errors.auth.keyfileInvalid');
  }
}

export async function loginWithRecoveryFile(file: File): Promise<LoginOutcome> {
  const contents = await readRecoveryFile(file);
  const { recoveryKey, recoveryWrapKey } = await deriveRecoveryCredentials(contents.secret);
  contents.secret.fill(0);
  try {
    const { user } = await loginWithRecovery({ userId: contents.userId, recoveryKey });
    return { user, credential: { type: 'recovery-v2', recoveryWrapKey } };
  } catch (error) {
    recoveryWrapKey.fill(0);
    throw error;
  }
}
