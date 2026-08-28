import { env } from '@config/env';
import type { User } from '../types';

interface ValidateCodeResponse {
  message: string;
  user: User;
}

export async function validateLoginCode(loginCode: string): Promise<User> {
  const response = await fetch(`${env.apiUrl}/api/users/validate-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginCode }),
  });

  const data = (await response.json().catch(() => null)) as Partial<ValidateCodeResponse> | null;

  if (!response.ok || !data?.user) {
    throw new Error(data?.message ?? 'Código de login inválido ou não encontrado!');
  }

  return data.user;
}
