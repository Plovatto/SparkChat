import { derivePasswordCredentials, deriveRecoveryCredentials, parseRecoveryFile, type RecoveryFileContents } from '@lib/e2ee';
import { fetchAuthParams, login, loginWithKeyfile, loginWithRecovery } from '../api/auth-api';
import type { PendingE2eCredential, User } from '../types';
import { rememberAuthParams, rememberAuthVersion } from './auth-params';

export interface LoginOutcome {
  user: User;
  credential: PendingE2eCredential;
}

export async function loginWithPassword(nickname: string, password: string): Promise<LoginOutcome> {
  const params = await fetchAuthParams(nickname);

  if (params.version === 1) {
    const { user, authVersion } = await login({ nickname, password }, 1);
    rememberAuthVersion(user.id, authVersion);
    return { user, credential: { type: 'password', password } };
  }

  const { authKey, wrapKey } = await derivePasswordCredentials(password, params.salt);
  try {
    const { user } = await login({ nickname, password: authKey }, 2);
    rememberAuthParams(user.id, { version: 2, salt: params.salt });
    return { user, credential: { type: 'password-v2', wrapKey } };
  } catch (error) {
    wrapKey.fill(0);
    throw error;
  }
}

async function readRecoveryFileV2(file: File): Promise<RecoveryFileContents | null> {
  try {
    return await parseRecoveryFile(await file.text());
  } catch {
    return null;
  }
}

export async function loginWithRecoveryFile(file: File): Promise<LoginOutcome> {
  const contents = await readRecoveryFileV2(file);

  if (!contents) {
    const { user, authVersion, recoveryToken } = await loginWithKeyfile(file);
    rememberAuthVersion(user.id, authVersion);
    return { user, credential: { type: 'keyfile', recoveryToken } };
  }

  const { recoveryKey, recoveryWrapKey } = await deriveRecoveryCredentials(contents.secret);
  contents.secret.fill(0);
  try {
    const { user, authVersion } = await loginWithRecovery({ userId: contents.userId, recoveryKey });
    rememberAuthVersion(user.id, authVersion);
    return { user, credential: { type: 'recovery-v2', recoveryWrapKey } };
  } catch (error) {
    recoveryWrapKey.fill(0);
    throw error;
  }
}
