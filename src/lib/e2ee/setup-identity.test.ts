import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@lib/socket';
import { deriveRecoveryCredentials, generateRecoverySecret, wrapPrivateKeyV2 } from './credentials';
import { generateIdentity } from './identity';
import { ensureIdentityAfterRecoveryLogin, ensureSigningKeyPublished, setupIdentityAfterRegister } from './setup-identity';
import { verifyKeyBinding } from './signing';

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
    const { recoveryWrapKey } = await deriveRecoveryCredentials(await generateRecoverySecret());
    const blob = await wrapPrivateKeyV2(identity.privateKey, recoveryWrapKey, 'me', identity.publicKey);
    await ensureIdentityAfterRecoveryLogin(
      socketReturning({ publicKey: identity.publicKey, encryptedPrivateKeyByPassword: null, encryptedPrivateKeyByRecovery: blob }),
      'me',
      recoveryWrapKey,
    );
    expect(saved).toEqual([{ userId: 'me', publicKey: identity.publicKey }]);
    expect(current.identity).toMatchObject({ userId: 'me', publicKey: identity.publicKey });
    expect(alert).not.toHaveBeenCalled();
  });

  it('refuses a server blob whose private key does not match the public key', async () => {
    const [published, substituted] = await Promise.all([generateIdentity(), generateIdentity()]);
    const { recoveryWrapKey } = await deriveRecoveryCredentials(await generateRecoverySecret());
    const blob = await wrapPrivateKeyV2(substituted.privateKey, recoveryWrapKey, 'me', published.publicKey);
    await ensureIdentityAfterRecoveryLogin(
      socketReturning({ publicKey: published.publicKey, encryptedPrivateKeyByPassword: null, encryptedPrivateKeyByRecovery: blob }),
      'me',
      recoveryWrapKey,
    );
    expect(saved).toEqual([]);
    expect(current.identity).toBeNull();
    expect(alert).toHaveBeenCalledWith('errors.e2ee.identityKeyMismatch');
  });
});

function recordingSocket(myKeys: Record<string, string | null>) {
  const emitted: { event: string; payload: unknown }[] = [];
  const handlers = new Map<string, (value: unknown) => void>();
  const socket = {
    on: (event: string, handler: (value: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
    emit: (event: string, payload?: unknown) => {
      emitted.push({ event, payload });
      if (event === 'e2e:get-my-keys') {
        queueMicrotask(() => handlers.get('e2e:my-keys')?.(myKeys));
      }
    },
  } as unknown as AppSocket;
  return { socket, emitted };
}

describe('signing key publication', () => {
  beforeEach(() => {
    current.identity = null;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes a verifiable signing proof when registering', async () => {
    const { socket, emitted } = recordingSocket({});

    await setupIdentityAfterRegister(socket, 'me', new Uint8Array(32).fill(1), new Uint8Array(32).fill(2));

    const published = emitted.find((entry) => entry.event === 'e2e:publish-keys')?.payload as {
      publicKey: string;
      signingPublicKey: string;
      keySignature: string;
    };
    expect(await verifyKeyBinding({ userId: 'me', ...published })).toBe(true);
  });

  it('publishes the signing key for an existing identity that has none', async () => {
    const identity = await generateIdentity();
    current.identity = { userId: 'me', publicKey: identity.publicKey, privateKey: identity.privateKey };
    const { socket, emitted } = recordingSocket({ publicKey: identity.publicKey, signingPublicKey: null });

    await ensureSigningKeyPublished(socket);

    const published = emitted.find((entry) => entry.event === 'e2e:publish-signing-key')?.payload as {
      signingPublicKey: string;
      keySignature: string;
    };
    expect(await verifyKeyBinding({ userId: 'me', publicKey: identity.publicKey, ...published })).toBe(true);
  });

  it('does nothing when the server already has the signing key, another public key, or no identity exists', async () => {
    const identity = await generateIdentity();
    current.identity = { userId: 'me', publicKey: identity.publicKey, privateKey: identity.privateKey };
    const published = recordingSocket({ publicKey: identity.publicKey, signingPublicKey: 'already' });
    const mismatch = recordingSocket({ publicKey: 'someone-elses', signingPublicKey: null });
    await ensureSigningKeyPublished(published.socket);
    await ensureSigningKeyPublished(mismatch.socket);
    current.identity = null;
    const signedOut = recordingSocket({ publicKey: identity.publicKey, signingPublicKey: null });
    await ensureSigningKeyPublished(signedOut.socket);

    for (const { emitted } of [published, mismatch, signedOut]) {
      expect(emitted.some((entry) => entry.event === 'e2e:publish-signing-key')).toBe(false);
    }
  });
});
