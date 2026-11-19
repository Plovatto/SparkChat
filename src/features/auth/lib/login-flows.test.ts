import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRecoveryFile, deriveRecoveryCredentials, derivePasswordCredentials, generateRecoverySecret } from '@lib/e2ee/credentials';
import { forgetAuthParams, resolveAuthParams } from './auth-params';
import { loginWithPassword, loginWithRecoveryFile } from './login-flows';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test', socketUrl: 'https://api.test' } }));

const FIXED_SALT = 'AAECAwQFBgcICQoLDA0ODw';
const USER = { id: 'user-1', nickname: 'alice', avatar: 0 };

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(routes: Record<string, () => Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const handler = Object.entries(routes).find(([path]) => url.endsWith(path))?.[1];
      return Promise.resolve(handler ? handler() : jsonResponse({ message: 'not found' }, 404));
    }),
  );
  return calls;
}

function bodyOf(call: Call | undefined): Record<string, unknown> {
  return JSON.parse(call?.init?.body as string) as Record<string, unknown>;
}

function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

beforeEach(() => {
  forgetAuthParams();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loginWithPassword', () => {
  it('sends only the derived auth key for v2 accounts', async () => {
    const calls = mockFetch({
      '/api/users/auth-params': () => jsonResponse({ version: 2, salt: FIXED_SALT }),
      '/api/users/login': () => jsonResponse({ message: 'ok', user: USER, sessionToken: 'tok', authVersion: 2 }),
    });

    const outcome = await loginWithPassword('alice', 'secret-password');

    const expected = await derivePasswordCredentials('secret-password', FIXED_SALT);
    expect(bodyOf(calls[0])).toEqual({ nickname: 'alice' });
    expect(bodyOf(calls[1])).toEqual({ nickname: 'alice', password: expected.authKey });
    expect(calls.some((call) => (call.init?.body as string).includes('secret-password'))).toBe(false);
    expect(outcome.credential.type).toBe('password-v2');
    expect(outcome.credential.type === 'password-v2' && Array.from(outcome.credential.wrapKey)).toEqual(Array.from(expected.wrapKey));
    expect(outcome.user).toMatchObject({ id: 'user-1', sessionToken: 'tok', authMethod: 'password' });
    await expect(resolveAuthParams('user-1', 'alice')).resolves.toEqual({ version: 2, salt: FIXED_SALT });
  });

  it('keeps the legacy plaintext login for v1 accounts', async () => {
    const calls = mockFetch({
      '/api/users/auth-params': () => jsonResponse({ version: 1 }),
      '/api/users/login': () => jsonResponse({ message: 'ok', user: USER, sessionToken: 'tok', authVersion: 1 }),
    });

    const outcome = await loginWithPassword('alice', 'secret-password');

    expect(bodyOf(calls[1])).toEqual({ nickname: 'alice', password: 'secret-password' });
    expect(outcome.credential).toEqual({ type: 'password', password: 'secret-password' });
  });

  it('never falls back to sending the password when auth params fail', async () => {
    const calls = mockFetch({
      '/api/users/auth-params': () => jsonResponse({ message: 'rate limited', code: 'auth.rateLimited' }, 429),
    });

    await expect(loginWithPassword('alice', 'secret-password')).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('rejects malformed salts', async () => {
    mockFetch({ '/api/users/auth-params': () => jsonResponse({ version: 2, salt: 'short' }) });
    await expect(loginWithPassword('alice', 'secret-password')).rejects.toThrow();
  });
});

describe('loginWithRecoveryFile', () => {
  it('parses a v2 file locally and sends only the recovery key', async () => {
    const secret = await generateRecoverySecret();
    const expected = await deriveRecoveryCredentials(secret);
    const contents = await buildRecoveryFile({ userId: 'user-1', nickname: 'alice', secret: secret.slice() });
    const file = new File([decodeBase64(contents)], 'sparkchat-alice.sparkkey');
    const calls = mockFetch({
      '/api/users/login-with-recovery': () => jsonResponse({ message: 'ok', user: USER, sessionToken: 'tok', authVersion: 2 }),
    });

    const outcome = await loginWithRecoveryFile(file);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.test/api/users/login-with-recovery');
    expect(bodyOf(calls[0])).toEqual({ userId: 'user-1', recoveryKey: expected.recoveryKey });
    expect(outcome.credential.type).toBe('recovery-v2');
    expect(outcome.credential.type === 'recovery-v2' && Array.from(outcome.credential.recoveryWrapKey)).toEqual(
      Array.from(expected.recoveryWrapKey),
    );
    expect(outcome.user.authMethod).toBe('keyfile');
  });

  it('uploads legacy files to the legacy endpoint', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 250, 251])], 'old.sparkkey');
    const calls = mockFetch({
      '/api/users/login-with-keyfile': () => jsonResponse({ message: 'ok', user: USER, sessionToken: 'tok', recoveryToken: 'legacy-token' }),
    });

    const outcome = await loginWithRecoveryFile(file);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.test/api/users/login-with-keyfile');
    expect(calls[0]?.init?.body).toBeInstanceOf(FormData);
    expect(outcome.credential).toEqual({ type: 'keyfile', recoveryToken: 'legacy-token' });
    await expect(resolveAuthParams('user-1', 'alice')).resolves.toEqual({ version: 1 });
  });

  it('surfaces a rejected v2 recovery login', async () => {
    const contents = await buildRecoveryFile({ userId: 'user-1', nickname: 'alice', secret: await generateRecoverySecret() });
    mockFetch({
      '/api/users/login-with-recovery': () => jsonResponse({ message: 'invalid', code: 'auth.keyfile.invalid' }, 401),
    });

    await expect(loginWithRecoveryFile(new File([decodeBase64(contents)], 'a.sparkkey'))).rejects.toThrow();
  });
});
