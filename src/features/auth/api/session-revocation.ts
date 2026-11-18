import { env } from '@config/env';
import { buildAuthHeader, type SessionAuth } from '@lib/api/session-auth';

export const REVOKE_SESSION_ATTEMPTS = 3;
export const REVOKE_SESSION_RETRY_DELAY_MS = 1000;

const ALREADY_LOGGED_OUT_STATUSES = new Set([401, 404]);

interface RevokeSessionOptions {
  attempts?: number;
  retryDelayMs?: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestRevocation(auth: SessionAuth): Promise<boolean> {
  try {
    const response = await fetch(`${env.apiUrl}/api/users/logout`, {
      method: 'POST',
      headers: buildAuthHeader(auth),
      keepalive: true,
      credentials: 'omit',
    });
    return response.ok || ALREADY_LOGGED_OUT_STATUSES.has(response.status);
  } catch {
    return false;
  }
}

export async function revokeServerSession(
  auth: SessionAuth,
  { attempts = REVOKE_SESSION_ATTEMPTS, retryDelayMs = REVOKE_SESSION_RETRY_DELAY_MS }: RevokeSessionOptions = {},
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await requestRevocation(auth)) {
      return true;
    }
    if (attempt < attempts) {
      await wait(retryDelayMs * attempt);
    }
  }
  return false;
}
