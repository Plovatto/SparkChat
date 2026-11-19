import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@lib/socket';
import { buildRecoveryFileOnce, completeRegistration, prepareRegistrationCredentials, upgradeLegacyCredentials } from './credential-flows';
import {
  deriveRecoveryCredentials,
  derivePasswordCredentials,
  generateRecoverySecret,
  unwrapPrivateKeyV2,
  wrapPrivateKeyV2,
} from './credentials';
import { generateIdentity, type Identity } from './identity';
import {
  ensureIdentityAfterPasswordLoginV2,
  ensureIdentityAfterRecoveryLogin,
  resolveIdentityForRewrap,
  setupIdentityAfterRegister,
} from './setup-identity';

const FIXED_SALT = 'AAECAwQFBgcICQoLDA0ODw';

const stored = vi.hoisted(() => ({ entry: null as { userId: string; publicKey: string; privateKey: Uint8Array } | null }));
const current = vi.hoisted((): { identity: { userId: string; publicKey: string; privateKey: Uint8Array } | null } => ({ identity: null }));

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));
vi.mock('./key-store', () => ({
  loadPrivateKey: () => Promise.resolve(stored.entry),
  savePrivateKey: (userId: string, publicKey: string, privateKey: Uint8Array) => {
    stored.entry = { userId, publicKey, privateKey };
    return Promise.resolve();
  },
  clearPrivateKey: () => Promise.resolve(),
}));
vi.mock('./current-identity', () => ({
  getCurrentIdentity: () => current.identity,
  setCurrentIdentity: (identity: typeof current.identity) => {
    current.identity = identity;
  },
}));

interface FakeSocket {
  socket: AppSocket;
  emitted: { event: string; payload: unknown }[];
  fire: (event: string, payload?: unknown) => void;
}

function createSocket(myKeys: Record<string, string | null> | null, reply?: (event: string, fire: FakeSocket['fire']) => void): FakeSocket {
  const handlers = new Map<string, Set<(value: unknown) => void>>();
  const emitted: FakeSocket['emitted'] = [];
  const fire = (event: string, payload?: unknown) => {
    for (const handler of Array.from(handlers.get(event) ?? [])) {
      handler(payload);
    }
  };
  const socket = {
    on: (event: string, handler: (value: unknown) => void) => {
      if (!handlers.has(event)) {
        handlers.set(event, new Set());
      }
      handlers.get(event)?.add(handler);
    },
    off: (event: string, handler: (value: unknown) => void) => handlers.get(event)?.delete(handler),
    emit: (event: string, payload?: unknown) => {
      emitted.push({ event, payload });
      if (event === 'e2e:get-my-keys' && myKeys) {
        queueMicrotask(() => fire('e2e:my-keys', myKeys));
      }
      reply?.(event, fire);
    },
  } as unknown as AppSocket;
  return { socket, emitted, fire };
}

type SentPayload = Record<
  'publicKey' | 'encryptedPrivateKeyByPassword' | 'encryptedPrivateKeyByRecovery' | 'currentPassword' | 'newAuthSalt' | 'newAuthKey' | 'recoveryVerifier',
  string
>;

function payloadOf(fake: FakeSocket, event: string): SentPayload {
  return fake.emitted.find((entry) => entry.event === event)?.payload as SentPayload;
}

async function wrapsFor(identity: Identity, userId: string) {
  const password = await derivePasswordCredentials('pw-123456', FIXED_SALT);
  const recovery = await deriveRecoveryCredentials(await generateRecoverySecret());
  return {
    password,
    recovery,
    encryptedPrivateKeyByPassword: await wrapPrivateKeyV2(identity.privateKey, password.wrapKey, userId, identity.publicKey),
    encryptedPrivateKeyByRecovery: await wrapPrivateKeyV2(identity.privateKey, recovery.recoveryWrapKey, userId, identity.publicKey),
  };
}

beforeEach(() => {
  stored.entry = null;
  current.identity = null;
  vi.stubGlobal('window', { alert: vi.fn() });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('setupIdentityAfterRegister', () => {
  it('publishes v2 wraps that open with the derived keys', async () => {
    const password = await derivePasswordCredentials('pw-123456', FIXED_SALT);
    const recovery = await deriveRecoveryCredentials(await generateRecoverySecret());
    const fake = createSocket(null);

    await setupIdentityAfterRegister(fake.socket, 'user-1', password.wrapKey, recovery.recoveryWrapKey);

    const published = payloadOf(fake, 'e2e:publish-keys');
    expect(JSON.parse(published.encryptedPrivateKeyByPassword)).toMatchObject({ v: 2 });
    expect(JSON.parse(published.encryptedPrivateKeyByRecovery)).toMatchObject({ v: 2 });
    const byPassword = await unwrapPrivateKeyV2(published.encryptedPrivateKeyByPassword, password.wrapKey, 'user-1', published.publicKey);
    const byRecovery = await unwrapPrivateKeyV2(published.encryptedPrivateKeyByRecovery, recovery.recoveryWrapKey, 'user-1', published.publicKey);
    expect(Array.from(byPassword)).toEqual(Array.from(byRecovery));
    expect(current.identity).toMatchObject({ userId: 'user-1', publicKey: published.publicKey });
  });
});

describe('v2 identity restore', () => {
  it('unwraps the password wrap with the wrap key', async () => {
    const identity = await generateIdentity();
    const wraps = await wrapsFor(identity, 'user-1');
    const fake = createSocket({ publicKey: identity.publicKey, encryptedPrivateKeyByPassword: wraps.encryptedPrivateKeyByPassword, encryptedPrivateKeyByRecovery: null });

    await ensureIdentityAfterPasswordLoginV2(fake.socket, 'user-1', wraps.password.wrapKey);

    expect(stored.entry?.publicKey).toBe(identity.publicKey);
    expect(Array.from(stored.entry?.privateKey ?? [])).toEqual(Array.from(identity.privateKey));
  });

  it('unwraps the recovery wrap with the recovery wrap key', async () => {
    const identity = await generateIdentity();
    const wraps = await wrapsFor(identity, 'user-1');
    const fake = createSocket({ publicKey: identity.publicKey, encryptedPrivateKeyByPassword: null, encryptedPrivateKeyByRecovery: wraps.encryptedPrivateKeyByRecovery });

    await ensureIdentityAfterRecoveryLogin(fake.socket, 'user-1', wraps.recovery.recoveryWrapKey);

    expect(current.identity?.publicKey).toBe(identity.publicKey);
  });

  it('does not accept a wrap bound to another user', async () => {
    const identity = await generateIdentity();
    const wraps = await wrapsFor(identity, 'someone-else');
    const fake = createSocket({ publicKey: identity.publicKey, encryptedPrivateKeyByPassword: wraps.encryptedPrivateKeyByPassword, encryptedPrivateKeyByRecovery: null });

    await ensureIdentityAfterPasswordLoginV2(fake.socket, 'user-1', wraps.password.wrapKey);

    expect(stored.entry).toBeNull();
    expect(current.identity).toBeNull();
  });
});

describe('resolveIdentityForRewrap', () => {
  it('returns null when the server has a public key this device cannot open', async () => {
    const identity = await generateIdentity();
    const fake = createSocket({ publicKey: identity.publicKey, encryptedPrivateKeyByPassword: null, encryptedPrivateKeyByRecovery: null });
    await expect(resolveIdentityForRewrap(fake.socket, 'user-1')).resolves.toBeNull();
  });

  it('creates and publishes a public key when the account has none', async () => {
    const fake = createSocket({ publicKey: null, encryptedPrivateKeyByPassword: null, encryptedPrivateKeyByRecovery: null });
    const identity = await resolveIdentityForRewrap(fake.socket, 'user-1');
    expect(identity).not.toBeNull();
    expect(payloadOf(fake, 'e2e:publish-keys')).toEqual({ publicKey: identity?.publicKey });
  });
});

describe('recovery file one-shot guards', () => {
  it('builds a file from a secret only once and never from a zeroed secret', async () => {
    const secret = await generateRecoverySecret();
    const original = Array.from(secret);

    const first = await buildRecoveryFileOnce({ userId: 'user-1', nickname: 'alice', secret });
    const second = await buildRecoveryFileOnce({ userId: 'user-1', nickname: 'alice', secret });

    expect(first).not.toBeNull();
    const parsed = JSON.parse(atob(first ?? '')) as { secret: string };
    expect(parsed.secret).not.toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(original.some((byte) => byte !== 0)).toBe(true);
    expect(Array.from(secret).every((byte) => byte === 0)).toBe(true);
    expect(second).toBeNull();
  });

  it('completes a registration once even when the registered event is handled twice', async () => {
    const credentials = await prepareRegistrationCredentials('pw-123456');
    const fake = createSocket(null);

    const [first, second] = await Promise.all([
      completeRegistration(fake.socket, 'user-1', 'alice', credentials),
      completeRegistration(fake.socket, 'user-1', 'alice', credentials),
    ]);
    await vi.waitFor(() => expect(fake.emitted.filter((entry) => entry.event === 'e2e:publish-keys')).toHaveLength(1));

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const published = payloadOf(fake, 'e2e:publish-keys');
    const recoverySecret = (JSON.parse(atob(first ?? '')) as { secret: string }).secret;
    const recovery = await deriveRecoveryCredentials(Uint8Array.from(atob(recoverySecret.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0)));
    expect(recovery.recoveryKey).toBe(credentials.recoveryVerifier);
    const unwrapped = await unwrapPrivateKeyV2(published.encryptedPrivateKeyByRecovery, recovery.recoveryWrapKey, 'user-1', published.publicKey);
    expect(unwrapped).toHaveLength(32);
  });
});

describe('upgradeLegacyCredentials', () => {
  it('sends v2 credentials derived on the device and returns the new secrets', async () => {
    const identity = await generateIdentity();
    current.identity = { userId: 'user-1', ...identity };
    const fake = createSocket(null, (event, fire) => {
      if (event === 'user:upgrade-credentials') {
        queueMicrotask(() => fire('user:credentials-upgraded', { authVersion: 2 }));
      }
    });

    const upgraded = await upgradeLegacyCredentials(fake.socket, 'user-1', 'legacy-password');

    expect(upgraded).not.toBeNull();
    const sent = payloadOf(fake, 'user:upgrade-credentials');
    expect(Object.keys(sent).sort()).toEqual(
      ['currentPassword', 'encryptedPrivateKeyByPassword', 'encryptedPrivateKeyByRecovery', 'newAuthKey', 'newAuthSalt', 'recoveryVerifier'].sort(),
    );
    expect(sent.currentPassword).toBe('legacy-password');
    expect(sent.newAuthSalt).toBe(upgraded?.authSalt);
    expect(sent.newAuthKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sent.newAuthKey).not.toContain('legacy-password');

    const { authKey, wrapKey } = await derivePasswordCredentials('legacy-password', upgraded?.authSalt ?? '');
    expect(sent.newAuthKey).toBe(authKey);
    const byPassword = await unwrapPrivateKeyV2(sent.encryptedPrivateKeyByPassword, wrapKey, 'user-1', identity.publicKey);
    expect(Array.from(byPassword)).toEqual(Array.from(identity.privateKey));

    const recovery = await deriveRecoveryCredentials(upgraded?.recoverySecret ?? new Uint8Array());
    expect(sent.recoveryVerifier).toBe(recovery.recoveryKey);
    const byRecovery = await unwrapPrivateKeyV2(sent.encryptedPrivateKeyByRecovery, recovery.recoveryWrapKey, 'user-1', identity.publicKey);
    expect(Array.from(byRecovery)).toEqual(Array.from(identity.privateKey));
  });

  it('returns null when the server rejects the upgrade', async () => {
    const identity = await generateIdentity();
    current.identity = { userId: 'user-1', ...identity };
    const fake = createSocket(null, (event, fire) => {
      if (event === 'user:upgrade-credentials') {
        queueMicrotask(() => fire('error', { message: 'nope', code: 'user.currentPasswordIncorrect', event: 'user:upgrade-credentials' }));
      }
    });

    await expect(upgradeLegacyCredentials(fake.socket, 'user-1', 'legacy-password')).resolves.toBeNull();
  });

  it('ignores errors that belong to other events', async () => {
    const identity = await generateIdentity();
    current.identity = { userId: 'user-1', ...identity };
    const fake = createSocket(null, (event, fire) => {
      if (event === 'user:upgrade-credentials') {
        queueMicrotask(() => {
          fire('error', { message: 'x', event: 'e2e:get-room-keys' });
          fire('error', { message: 'y', clientTempId: 'tmp' });
          fire('error', { message: 'z', code: 'user.currentPasswordIncorrect' });
          fire('user:credentials-upgraded', { authVersion: 2 });
        });
      }
    });

    await expect(upgradeLegacyCredentials(fake.socket, 'user-1', 'legacy-password')).resolves.not.toBeNull();
  });

  it('gives up without an identity to wrap', async () => {
    const identity = await generateIdentity();
    const fake = createSocket({ publicKey: identity.publicKey, encryptedPrivateKeyByPassword: null, encryptedPrivateKeyByRecovery: null });

    await expect(upgradeLegacyCredentials(fake.socket, 'user-1', 'legacy-password')).resolves.toBeNull();
    expect(fake.emitted.some((entry) => entry.event === 'user:upgrade-credentials')).toBe(false);
  });
});
