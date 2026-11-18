import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@lib/socket';
import { generateIdentity, wrapPrivateKeyWithRecoveryToken } from './identity';
import { ensureIdentityAfterKeyfileLogin } from './setup-identity';

const saved = vi.hoisted(() => [] as { userId: string; publicKey: string }[]);
const current = vi.hoisted((): { identity: unknown } => ({ identity: null }));

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));
vi.mock('./key-store', () => ({
  loadPrivateKey: () => Promise.resolve(null),
  savePrivateKey: (userId: string, publicKey: string) => {
    saved.push({ userId, publicKey });
    return Promise.resolve();
  },
  clearPrivateKey: () => Promise.resolve(),
}));
vi.mock('./current-identity', () => ({
  getCurrentIdentity: () => current.identity,
  setCurrentIdentity: (identity: unknown) => {
    current.identity = identity;
  },
}));

function socketReturning(payload: Record<string, string | null>): AppSocket {
  const handlers = new Map<string, (value: unknown) => void>();
  return {
    on: (event: string, handler: (value: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
    emit: (event: string) => {
      if (event === 'e2e:get-my-keys') {
        queueMicrotask(() => handlers.get('e2e:my-keys')?.(payload));
      }
    },
  } as unknown as AppSocket;
}

describe('identity unwrap verification', () => {
  const alert = vi.fn();

  beforeEach(() => {
    saved.length = 0;
    current.identity = null;
    alert.mockReset();
    vi.stubGlobal('window', { alert });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stores the unwrapped key when it matches the published public key', async () => {
    const identity = await generateIdentity();
    const blob = await wrapPrivateKeyWithRecoveryToken(identity.privateKey, 'token');
    await ensureIdentityAfterKeyfileLogin(
      socketReturning({ publicKey: identity.publicKey, encryptedPrivateKeyByPassword: null, encryptedPrivateKeyByRecovery: blob }),
      'me',
      'token',
    );
    expect(saved).toEqual([{ userId: 'me', publicKey: identity.publicKey }]);
    expect(current.identity).toMatchObject({ userId: 'me', publicKey: identity.publicKey });
    expect(alert).not.toHaveBeenCalled();
  });

  it('refuses a server blob whose private key does not match the public key', async () => {
    const [published, substituted] = await Promise.all([generateIdentity(), generateIdentity()]);
    const blob = await wrapPrivateKeyWithRecoveryToken(substituted.privateKey, 'token');
    await ensureIdentityAfterKeyfileLogin(
      socketReturning({ publicKey: published.publicKey, encryptedPrivateKeyByPassword: null, encryptedPrivateKeyByRecovery: blob }),
      'me',
      'token',
    );
    expect(saved).toEqual([]);
    expect(current.identity).toBeNull();
    expect(alert).toHaveBeenCalledWith('errors.e2ee.identityKeyMismatch');
  });
});
