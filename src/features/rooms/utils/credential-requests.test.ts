import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAuthParams, rememberAuthParams } from '@features/auth/lib/auth-params';
import { deriveRecoveryCredentials, derivePasswordCredentials, unwrapPrivateKeyV2 } from '@lib/e2ee/credentials';
import { generateIdentity, type Identity } from '@lib/e2ee/identity';
import type { AppSocket } from '@lib/socket';
import {
  buildChangePasswordRequest,
  buildRegenerateRecoveryRequest,
  IdentityUnavailableError,
  resolveProfileUpdateProof,
} from './credential-requests';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test', socketUrl: 'https://api.test' } }));

const identityState = vi.hoisted(() => ({ value: null as { publicKey: string; privateKey: Uint8Array } | null }));

vi.mock('@lib/e2ee/setup-identity', () => ({
  resolveIdentityForRewrap: () => Promise.resolve(identityState.value),
}));

const SALT = 'AAECAwQFBgcICQoLDA0ODw';
const socket = {} as AppSocket;
const account = { socket, userId: 'user-1', nickname: 'alice' };
let identity: Identity;

beforeEach(async () => {
  forgetAuthParams();
  identity = await generateIdentity();
  identityState.value = identity;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('unexpected fetch'))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildChangePasswordRequest', () => {
  it('sends derived keys and a v2 password wrap for v2 accounts, without a recovery pair', async () => {
    rememberAuthParams('user-1', { version: 2, salt: SALT });

    const request = await buildChangePasswordRequest(account, 'old-password', 'new-password');

    const current = await derivePasswordCredentials('old-password', SALT);
    const next = await derivePasswordCredentials('new-password', request.authSalt);
    expect(request.payload.currentPassword).toBe(current.authKey);
    expect(request.payload.newPassword).toBe(next.authKey);
    expect(request.payload.newAuthSalt).toBe(request.authSalt);
    expect(request.authSalt).not.toBe(SALT);
    expect(request.payload).not.toHaveProperty('recoveryVerifier');
    expect(request.payload).not.toHaveProperty('encryptedPrivateKeyByRecovery');
    const unwrapped = await unwrapPrivateKeyV2(request.payload.encryptedPrivateKeyByPassword ?? '', next.wrapKey, 'user-1', identity.publicKey);
    expect(Array.from(unwrapped)).toEqual(Array.from(identity.privateKey));
    expect(JSON.stringify(request.payload)).not.toMatch(/old-password|new-password/);
  }, 30000);

  it('omits the current password for keyfile sessions', async () => {
    rememberAuthParams('user-1', { version: 2, salt: SALT });
    const request = await buildChangePasswordRequest(account, '', 'new-password');
    expect(request.payload.currentPassword).toBeUndefined();
  });

  it('refuses a server that reports a legacy v1 account instead of sending the plaintext password', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version: 1 }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(buildChangePasswordRequest(account, 'old-password', 'new-password')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches auth params when they are not in memory', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version: 2, salt: SALT }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    const request = await buildChangePasswordRequest(account, 'old-password', 'new-password');

    expect(fetchMock).toHaveBeenCalledWith('https://api.test/api/users/auth-params', expect.objectContaining({ method: 'POST' }));
    expect(request.payload.currentPassword).toBe((await derivePasswordCredentials('old-password', SALT)).authKey);
  });

  it('fails when the identity cannot be opened on this device', async () => {
    rememberAuthParams('user-1', { version: 2, salt: SALT });
    identityState.value = null;
    await expect(buildChangePasswordRequest(account, 'old-password', 'new-password')).rejects.toBeInstanceOf(IdentityUnavailableError);
  });
});

describe('buildRegenerateRecoveryRequest', () => {
  it('creates the recovery secret locally for v2 accounts', async () => {
    rememberAuthParams('user-1', { version: 2, salt: SALT });

    const request = await buildRegenerateRecoveryRequest(account, 'my-password');

    expect(request.payload.currentPassword).toBe((await derivePasswordCredentials('my-password', SALT)).authKey);
    const recovery = await deriveRecoveryCredentials(request.recoverySecret ?? new Uint8Array());
    expect(request.payload.recoveryVerifier).toBe(recovery.recoveryKey);
    const unwrapped = await unwrapPrivateKeyV2(request.payload.encryptedPrivateKeyByRecovery ?? '', recovery.recoveryWrapKey, 'user-1', identity.publicKey);
    expect(Array.from(unwrapped)).toEqual(Array.from(identity.privateKey));
  });

  it('never builds a legacy request with the plaintext password', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version: 1 }), { status: 200 }))));
    await expect(buildRegenerateRecoveryRequest(account, 'my-password')).rejects.toThrow();
  });
});

describe('resolveProfileUpdateProof', () => {
  it('derives the auth key and never returns the password', async () => {
    rememberAuthParams('user-1', { version: 2, salt: SALT });
    await expect(resolveProfileUpdateProof('user-1', 'alice', 'pw')).resolves.toBe((await derivePasswordCredentials('pw', SALT)).authKey);
  });
});
