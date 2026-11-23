import { createHash, createPublicKey, verify } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test', socketUrl: 'https://api.test' } }));

type DeviceKeyModule = typeof import('./device-key');
type SessionAuthModule = typeof import('./session-auth');

const AUTH = { userId: 'user-1', sessionToken: 'token-1' };

async function freshModules(): Promise<{ deviceKey: DeviceKeyModule; sessionAuth: SessionAuthModule }> {
  vi.resetModules();
  const deviceKey = await import('./device-key');
  const sessionAuth = await import('./session-auth');
  return { deviceKey, sessionAuth };
}

function headerMap(init: RequestInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(init?.headers).entries());
}

function verifyHeaders(publicKey: string, userId: string, method: string, path: string, body: string | null, headers: Record<string, string>): boolean {
  const bodyHash = body === null ? 'UNSIGNED-PAYLOAD' : createHash('sha256').update(body).digest('base64url');
  const canonical = ['SPARKCHAT-SIG-V1', userId, method, path, headers['x-spark-timestamp'], headers['x-spark-nonce'], bodyHash].join('\n');
  const key = createPublicKey({ key: Buffer.from(publicKey, 'base64url'), format: 'der', type: 'spki' });
  return verify('sha256', Buffer.from(canonical), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(headers['x-spark-signature'] ?? '', 'base64url'));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('device key lifecycle', () => {
  it('creates a non-extractable key at login and binds it to the user', async () => {
    const { deviceKey } = await freshModules();

    const publicKey = await deviceKey.prepareLoginDeviceKey();
    await deviceKey.completeLoginDeviceKey(AUTH.userId, publicKey, true);
    const record = await deviceKey.getDeviceKey(AUTH.userId);

    expect(publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(record).toMatchObject({ userId: AUTH.userId, publicKey, bound: true });
    expect(record?.keyPair.privateKey.extractable).toBe(false);
    expect(await deviceKey.getDeviceKey('someone-else')).toBeNull();
  });

  it('migrates an existing session once, with a proof made by the new key', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(jsonResponse(200, { status: 'bound' })));
    vi.stubGlobal('fetch', fetchMock);
    const { sessionAuth } = await freshModules();

    const record = await sessionAuth.ensureSessionDeviceKey(AUTH);
    const again = await sessionAuth.ensureSessionDeviceKey(AUTH);

    expect(record?.bound).toBe(true);
    expect(again?.publicKey).toBe(record?.publicKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/api/users/session/device-key');
    const body = init?.body as string;
    expect(JSON.parse(body)).toEqual({ publicKey: record?.publicKey });
    expect(verifyHeaders(record?.publicKey ?? '', AUTH.userId, 'POST', '/api/users/session/device-key', body, headerMap(init))).toBe(true);
  });

  it('keeps the key unbound and retries later when the API does not support binding', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(404, {})));
    vi.stubGlobal('fetch', fetchMock);
    const { sessionAuth } = await freshModules();

    const first = await sessionAuth.ensureSessionDeviceKey(AUTH);
    const second = await sessionAuth.ensureSessionDeviceKey(AUTH);

    expect(first?.bound).toBe(false);
    expect(second?.publicKey).toBe(first?.publicKey);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('drops the local key when the session is bound to another device', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(409, { code: 'auth.deviceKeyConflict' }))));
    const { deviceKey, sessionAuth } = await freshModules();

    const record = await sessionAuth.ensureSessionDeviceKey(AUTH);

    expect(record).toBeNull();
    expect(await deviceKey.getDeviceKey(AUTH.userId)).toBeNull();
  });
});

describe('authorizedFetch', () => {
  it('sends unsigned legacy requests when there is no device key', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(jsonResponse(200, {})));
    vi.stubGlobal('fetch', fetchMock);
    const { sessionAuth } = await freshModules();

    await sessionAuth.authorizedFetch(AUTH, '/api/gifs/status');

    const headers = headerMap(fetchMock.mock.calls[0]?.[1]);
    expect(headers.authorization).toBe('Bearer user-1:token-1');
    expect(headers['x-spark-signature']).toBeUndefined();
  });

  it('signs JSON and multipart requests with the device key', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(jsonResponse(200, {})));
    vi.stubGlobal('fetch', fetchMock);
    const { deviceKey, sessionAuth } = await freshModules();
    const publicKey = await deviceKey.prepareLoginDeviceKey();
    await deviceKey.completeLoginDeviceKey(AUTH.userId, publicKey, true);
    const body = JSON.stringify({ url: 'https://example.com' });

    await sessionAuth.authorizedFetch(AUTH, '/api/link-preview?x=1', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
    await sessionAuth.authorizedFetch(AUTH, '/api/uploads/image', { method: 'POST', body: new FormData() });

    const jsonHeaders = headerMap(fetchMock.mock.calls[0]?.[1]);
    const formHeaders = headerMap(fetchMock.mock.calls[1]?.[1]);
    expect(jsonHeaders['content-type']).toBe('application/json');
    expect(verifyHeaders(publicKey ?? '', AUTH.userId, 'POST', '/api/link-preview?x=1', body, jsonHeaders)).toBe(true);
    expect(verifyHeaders(publicKey ?? '', AUTH.userId, 'POST', '/api/uploads/image', null, formHeaders)).toBe(true);
    expect(jsonHeaders['x-spark-nonce']).not.toBe(formHeaders['x-spark-nonce']);
  });

  it('corrects clock skew from a stale signature error and retries once', async () => {
    const serverTime = Date.now() + 20 * 60 * 1000;
    const fetchMock = vi
      .fn((_url: string, _init?: RequestInit) => Promise.resolve(jsonResponse(200, {})))
      .mockResolvedValueOnce(jsonResponse(401, { code: 'auth.signatureStale', params: { serverTime } }));
    vi.stubGlobal('fetch', fetchMock);
    const { deviceKey, sessionAuth } = await freshModules();
    const publicKey = await deviceKey.prepareLoginDeviceKey();
    await deviceKey.completeLoginDeviceKey(AUTH.userId, publicKey, true);

    const response = await sessionAuth.authorizedFetch(AUTH, '/api/gifs/status');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retried = Number(headerMap(fetchMock.mock.calls[1]?.[1])['x-spark-timestamp']);
    expect(Math.abs(retried - serverTime)).toBeLessThan(5000);
  });

  it('builds a socket join proof bound to the user', async () => {
    const { deviceKey } = await freshModules();
    const publicKey = await deviceKey.prepareLoginDeviceKey();
    await deviceKey.completeLoginDeviceKey(AUTH.userId, publicKey, true);

    const proof = await deviceKey.buildSocketJoinProof(AUTH.userId);

    expect(proof).not.toBeNull();
    const headers = { 'x-spark-timestamp': String(proof?.timestamp), 'x-spark-nonce': proof?.nonce ?? '', 'x-spark-signature': proof?.signature ?? '' };
    expect(verifyHeaders(publicKey ?? '', AUTH.userId, 'SOCKET', 'user:join', '', headers)).toBe(true);
  });
});
