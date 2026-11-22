import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkNicknameAvailability } from './auth-api';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test', socketUrl: 'https://api.test' } }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkNicknameAvailability', () => {
  it('returns the status reported by the server', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ status: 'taken' }))));

    await expect(checkNicknameAvailability('ada')).resolves.toBe('taken');
  });

  it('fails instead of reporting an invalid nickname when the lookup is rate limited', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ code: 'rateLimit.loginAttempts', message: 'slow down' }, { status: 429 }))));

    await expect(checkNicknameAvailability('ada')).rejects.toThrow();
  });
});
