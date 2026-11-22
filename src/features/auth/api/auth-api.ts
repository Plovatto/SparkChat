import { env } from '@config/env';
import { toApiError } from '@lib/api/api-error';
import type { LoginCredentials, User } from '../types';

export type NicknameAvailabilityStatus = 'available' | 'taken' | 'invalid';

export interface AuthParams {
  version: 2;
  salt: string;
}

interface LoginResponse {
  message: string;
  user: Omit<User, 'sessionToken'>;
  sessionToken: string;
}

interface NicknameAvailabilityResponse {
  status: NicknameAvailabilityStatus;
}

export interface LoginResult {
  user: User;
}

export interface RecoveryLoginInput {
  userId: string;
  recoveryKey: string;
}

const AUTH_SALT_PATTERN = /^[A-Za-z0-9_-]{22}$/;

async function parseLoginResponse(response: Response): Promise<LoginResponse> {
  const data = (await response.json().catch(() => null)) as Partial<LoginResponse> | null;

  if (!response.ok || !data?.user || !data.sessionToken) {
    throw toApiError(data, 'auth.login.failed');
  }

  return data as LoginResponse;
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
  if (data.version === 2 && typeof data.salt === 'string' && AUTH_SALT_PATTERN.test(data.salt)) {
    return { version: 2, salt: data.salt };
  }
  throw toApiError(null, 'auth.login.failed');
}

export async function login({ nickname, password }: LoginCredentials): Promise<LoginResult> {
  const response = await fetch(`${env.apiUrl}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, password }),
  });

  const data = await parseLoginResponse(response);
  return { user: { ...data.user, sessionToken: data.sessionToken, authMethod: 'password' } };
}

export async function loginWithRecovery({ userId, recoveryKey }: RecoveryLoginInput): Promise<LoginResult> {
  const response = await fetch(`${env.apiUrl}/api/users/login-with-recovery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, recoveryKey }),
  });

  const data = await parseLoginResponse(response);
  return { user: { ...data.user, sessionToken: data.sessionToken, authMethod: 'keyfile' } };
}

export async function checkNicknameAvailability(nickname: string): Promise<NicknameAvailabilityStatus> {
  const response = await fetch(`${env.apiUrl}/api/users/nickname-availability?nickname=${encodeURIComponent(nickname)}`);
  const data = (await response.json().catch(() => null)) as Partial<NicknameAvailabilityResponse> | null;
  if (!response.ok) {
    throw toApiError(data, 'errors.user.nicknameCheckFailed');
  }

  return data?.status ?? 'invalid';
}
