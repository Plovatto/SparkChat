import { env } from '@config/env';
import { toApiError } from '@lib/api/api-error';
import type { AuthVersion } from '@lib/socket';
import type { LoginCredentials, User } from '../types';

export type NicknameAvailabilityStatus = 'available' | 'taken' | 'invalid';

export type AuthParams = { version: 1 } | { version: 2; salt: string };

interface LoginResponse {
  message: string;
  user: Omit<User, 'sessionToken'>;
  sessionToken: string;
  authVersion?: AuthVersion;
}

interface KeyfileLoginResponse extends LoginResponse {
  recoveryToken: string;
}

interface NicknameAvailabilityResponse {
  status: NicknameAvailabilityStatus;
}

export interface LoginResult {
  user: User;
  authVersion: AuthVersion;
}

export interface RecoveryLoginInput {
  userId: string;
  recoveryKey: string;
}

const AUTH_SALT_PATTERN = /^[A-Za-z0-9_-]{22}$/;

async function parseLoginResponse<T extends LoginResponse>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as Partial<T> | null;

  if (!response.ok || !data?.user || !data.sessionToken) {
    throw toApiError(data, 'auth.login.failed');
  }

  return data as T;
}

function resolveAuthVersion(value: unknown, fallback: AuthVersion): AuthVersion {
  return value === 1 || value === 2 ? value : fallback;
}

export async function fetchAuthParams(nickname: string): Promise<AuthParams> {
  const response = await fetch(`${env.apiUrl}/api/users/auth-params`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  const data = (await response.json().catch(() => null)) as { version?: unknown; salt?: unknown } | null;

  if (!response.ok || !data) {
    throw toApiError(data, 'auth.login.failed');
  }
  if (data.version === 1) {
    return { version: 1 };
  }
  if (data.version === 2 && typeof data.salt === 'string' && AUTH_SALT_PATTERN.test(data.salt)) {
    return { version: 2, salt: data.salt };
  }
  throw toApiError(null, 'auth.login.failed');
}

export async function login({ nickname, password }: LoginCredentials, expectedVersion: AuthVersion): Promise<LoginResult> {
  const response = await fetch(`${env.apiUrl}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, password }),
  });

  const data = await parseLoginResponse<LoginResponse>(response);
  return {
    user: { ...data.user, sessionToken: data.sessionToken, authMethod: 'password' },
    authVersion: resolveAuthVersion(data.authVersion, expectedVersion),
  };
}

export async function loginWithRecovery({ userId, recoveryKey }: RecoveryLoginInput): Promise<LoginResult> {
  const response = await fetch(`${env.apiUrl}/api/users/login-with-recovery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, recoveryKey }),
  });

  const data = await parseLoginResponse<LoginResponse>(response);
  return {
    user: { ...data.user, sessionToken: data.sessionToken, authMethod: 'keyfile' },
    authVersion: resolveAuthVersion(data.authVersion, 2),
  };
}

export async function loginWithKeyfile(file: File): Promise<LoginResult & { recoveryToken: string }> {
  const formData = new FormData();
  formData.append('keyfile', file);

  const response = await fetch(`${env.apiUrl}/api/users/login-with-keyfile`, {
    method: 'POST',
    body: formData,
  });

  const data = await parseLoginResponse<KeyfileLoginResponse>(response);
  return {
    user: { ...data.user, sessionToken: data.sessionToken, authMethod: 'keyfile' },
    authVersion: resolveAuthVersion(data.authVersion, 1),
    recoveryToken: data.recoveryToken,
  };
}

export async function checkNicknameAvailability(nickname: string): Promise<NicknameAvailabilityStatus> {
  const response = await fetch(`${env.apiUrl}/api/users/nickname-availability?nickname=${encodeURIComponent(nickname)}`);
  const data = (await response.json().catch(() => null)) as Partial<NicknameAvailabilityResponse> | null;

  return data?.status ?? 'invalid';
}
