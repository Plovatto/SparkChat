import { env } from '@config/env';
import type { LoginCredentials, User } from '../types';

export type NicknameAvailabilityStatus = 'available' | 'taken' | 'invalid';

interface LoginResponse {
  message: string;
  user: Omit<User, 'sessionToken'>;
  sessionToken: string;
}

interface NicknameAvailabilityResponse {
  status: NicknameAvailabilityStatus;
}

async function parseLoginResponse(response: Response): Promise<User> {
  const data = (await response.json().catch(() => null)) as Partial<LoginResponse> | null;

  if (!response.ok || !data?.user || !data.sessionToken) {
    throw new Error(data?.message ?? 'Não foi possível entrar. Tente novamente!');
  }

  return { ...data.user, sessionToken: data.sessionToken };
}

export async function login({ nickname, password }: LoginCredentials): Promise<User> {
  const response = await fetch(`${env.apiUrl}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, password }),
  });

  const user = await parseLoginResponse(response);
  return { ...user, authMethod: 'password' };
}

export async function loginWithKeyfile(file: File): Promise<User> {
  const formData = new FormData();
  formData.append('keyfile', file);

  const response = await fetch(`${env.apiUrl}/api/users/login-with-keyfile`, {
    method: 'POST',
    body: formData,
  });

  const user = await parseLoginResponse(response);
  return { ...user, authMethod: 'keyfile' };
}

export async function checkNicknameAvailability(nickname: string): Promise<NicknameAvailabilityStatus> {
  const response = await fetch(`${env.apiUrl}/api/users/nickname-availability?nickname=${encodeURIComponent(nickname)}`);
  const data = (await response.json().catch(() => null)) as Partial<NicknameAvailabilityResponse> | null;

  return data?.status ?? 'invalid';
}
