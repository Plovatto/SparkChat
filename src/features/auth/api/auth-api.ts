import { env } from '@config/env';
import type { LoginCredentials, User } from '../types';

export type NicknameAvailabilityStatus = 'available' | 'taken' | 'invalid';

interface LoginResponse {
  message: string;
  user: Omit<User, 'sessionToken'>;
  sessionToken: string;
}

interface KeyfileLoginResponse extends LoginResponse {
  recoveryToken: string;
}

interface NicknameAvailabilityResponse {
  status: NicknameAvailabilityStatus;
}

async function parseLoginResponse<T extends LoginResponse>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as Partial<T> | null;

  if (!response.ok || !data?.user || !data.sessionToken) {
    throw new Error(data?.message ?? 'Não foi possível entrar. Tente novamente!');
  }

  return data as T;
}

export async function login({ nickname, password }: LoginCredentials): Promise<User> {
  const response = await fetch(`${env.apiUrl}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, password }),
  });

  const data = await parseLoginResponse<LoginResponse>(response);
  return { ...data.user, sessionToken: data.sessionToken, authMethod: 'password' };
}

export async function loginWithKeyfile(file: File): Promise<{ user: User; recoveryToken: string }> {
  const formData = new FormData();
  formData.append('keyfile', file);

  const response = await fetch(`${env.apiUrl}/api/users/login-with-keyfile`, {
    method: 'POST',
    body: formData,
  });

  const data = await parseLoginResponse<KeyfileLoginResponse>(response);
  return {
    user: { ...data.user, sessionToken: data.sessionToken, authMethod: 'keyfile' },
    recoveryToken: data.recoveryToken,
  };
}

export async function checkNicknameAvailability(nickname: string): Promise<NicknameAvailabilityStatus> {
  const response = await fetch(`${env.apiUrl}/api/users/nickname-availability?nickname=${encodeURIComponent(nickname)}`);
  const data = (await response.json().catch(() => null)) as Partial<NicknameAvailabilityResponse> | null;

  return data?.status ?? 'invalid';
}
