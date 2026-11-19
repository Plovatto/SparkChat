import { translate } from '@lib/i18n/app-i18n';
import type { AppSocket } from '@lib/socket';
import { unwrapPrivateKeyV2, wrapPrivateKeyV2 } from './credentials';
import { getCurrentIdentity, setCurrentIdentity } from './current-identity';
import { clearPrivateKey, loadPrivateKey, savePrivateKey } from './key-store';
import { safeAsync } from './safe-async';
import {
  generateIdentity,
  IdentityKeyMismatchError,
  privateKeyMatchesPublicKey,
  unwrapPrivateKeyWithPassword,
  unwrapPrivateKeyWithRecoveryToken,
  wrapPrivateKeyWithRecoveryToken,
} from './identity';

const MY_KEYS_TIMEOUT_MS = 8000;

interface MyKeysPayload {
  publicKey: string | null;
  encryptedPrivateKeyByPassword: string | null;
  encryptedPrivateKeyByRecovery: string | null;
}

type WrapField = 'encryptedPrivateKeyByPassword' | 'encryptedPrivateKeyByRecovery';

export interface ResolvedIdentity {
  publicKey: string;
  privateKey: Uint8Array;
}

function requestMyKeys(socket: AppSocket): Promise<MyKeysPayload | null> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: MyKeysPayload | null) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.off('e2e:my-keys', handleKeys);
      resolve(value);
    };

    const handleKeys = (payload: MyKeysPayload) => finish(payload);

    socket.on('e2e:my-keys', handleKeys);
    socket.emit('e2e:get-my-keys');
    setTimeout(() => finish(null), MY_KEYS_TIMEOUT_MS);
  });
}

async function assertPrivateKeyMatches(privateKey: Uint8Array, publicKey: string): Promise<void> {
  if (await privateKeyMatchesPublicKey(privateKey, publicKey)) {
    return;
  }
  privateKey.fill(0);
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(translate('errors.e2ee.identityKeyMismatch'));
  }
  throw new IdentityKeyMismatchError();
}

async function setupIdentityAfterRegisterImpl(
  socket: AppSocket,
  userId: string,
  wrapKey: Uint8Array,
  recoveryWrapKey: Uint8Array,
): Promise<void> {
  const identity = await generateIdentity();
  const [encryptedPrivateKeyByPassword, encryptedPrivateKeyByRecovery] = await Promise.all([
    wrapPrivateKeyV2(identity.privateKey, wrapKey, userId, identity.publicKey),
    wrapPrivateKeyV2(identity.privateKey, recoveryWrapKey, userId, identity.publicKey),
  ]);

  await savePrivateKey(userId, identity.publicKey, identity.privateKey);
  setCurrentIdentity({ userId, publicKey: identity.publicKey, privateKey: identity.privateKey });
  socket.emit('e2e:publish-keys', {
    publicKey: identity.publicKey,
    encryptedPrivateKeyByPassword,
    encryptedPrivateKeyByRecovery,
  });
}

async function hydrateCurrentIdentityImpl(userId: string): Promise<void> {
  const cached = await loadPrivateKey(userId);
  if (cached) {
    setCurrentIdentity({ userId, publicKey: cached.publicKey, privateKey: cached.privateKey });
  }
}

async function restoreIdentityFromServer(
  socket: AppSocket,
  userId: string,
  field: WrapField,
  unwrap: (wrapped: string, publicKey: string) => Promise<Uint8Array>,
): Promise<void> {
  const cached = await loadPrivateKey(userId);
  if (cached) {
    setCurrentIdentity({ userId, publicKey: cached.publicKey, privateKey: cached.privateKey });
    return;
  }

  const myKeys = await requestMyKeys(socket);
  const wrapped = myKeys?.[field];
  if (!myKeys?.publicKey || !wrapped) {
    return;
  }

  const privateKey = await unwrap(wrapped, myKeys.publicKey);
  await assertPrivateKeyMatches(privateKey, myKeys.publicKey);
  await savePrivateKey(userId, myKeys.publicKey, privateKey);
  setCurrentIdentity({ userId, publicKey: myKeys.publicKey, privateKey });
}

function ensureIdentityAfterPasswordLoginImpl(socket: AppSocket, userId: string, password: string): Promise<void> {
  return restoreIdentityFromServer(socket, userId, 'encryptedPrivateKeyByPassword', (wrapped) =>
    unwrapPrivateKeyWithPassword(wrapped, password),
  );
}

function ensureIdentityAfterPasswordLoginV2Impl(socket: AppSocket, userId: string, wrapKey: Uint8Array): Promise<void> {
  return restoreIdentityFromServer(socket, userId, 'encryptedPrivateKeyByPassword', (wrapped, publicKey) =>
    unwrapPrivateKeyV2(wrapped, wrapKey, userId, publicKey),
  );
}

function ensureIdentityAfterKeyfileLoginImpl(socket: AppSocket, userId: string, recoveryToken: string): Promise<void> {
  return restoreIdentityFromServer(socket, userId, 'encryptedPrivateKeyByRecovery', (wrapped) =>
    unwrapPrivateKeyWithRecoveryToken(wrapped, recoveryToken),
  );
}

function ensureIdentityAfterRecoveryLoginImpl(socket: AppSocket, userId: string, recoveryWrapKey: Uint8Array): Promise<void> {
  return restoreIdentityFromServer(socket, userId, 'encryptedPrivateKeyByRecovery', (wrapped, publicKey) =>
    unwrapPrivateKeyV2(wrapped, recoveryWrapKey, userId, publicKey),
  );
}

export async function resolveIdentityForRewrap(socket: AppSocket, userId: string): Promise<ResolvedIdentity | null> {
  const active = getCurrentIdentity();
  if (active?.userId === userId) {
    return { publicKey: active.publicKey, privateKey: active.privateKey };
  }

  const cached = await loadPrivateKey(userId);
  if (cached) {
    setCurrentIdentity({ userId, publicKey: cached.publicKey, privateKey: cached.privateKey });
    return cached;
  }

  const myKeys = await requestMyKeys(socket);
  if (!myKeys || myKeys.publicKey) {
    return null;
  }

  const identity = await generateIdentity();
  await savePrivateKey(userId, identity.publicKey, identity.privateKey);
  setCurrentIdentity({ userId, publicKey: identity.publicKey, privateKey: identity.privateKey });
  socket.emit('e2e:publish-keys', { publicKey: identity.publicKey });
  return identity;
}

async function rewrapIdentityAfterLegacyRecoveryRegenerateImpl(
  socket: AppSocket,
  userId: string,
  newRecoveryToken: string,
): Promise<void> {
  const active = getCurrentIdentity();
  const cached = active?.userId === userId ? { publicKey: active.publicKey, privateKey: active.privateKey } : await loadPrivateKey(userId);
  if (!cached) {
    return;
  }

  const encryptedPrivateKeyByRecovery = await wrapPrivateKeyWithRecoveryToken(cached.privateKey, newRecoveryToken);
  socket.emit('e2e:publish-keys', { encryptedPrivateKeyByRecovery });
}

async function clearIdentityImpl(): Promise<void> {
  setCurrentIdentity(null);
  await clearPrivateKey();
}

export const setupIdentityAfterRegister = safeAsync('setupIdentityAfterRegister', setupIdentityAfterRegisterImpl);
export const hydrateCurrentIdentity = safeAsync('hydrateCurrentIdentity', hydrateCurrentIdentityImpl);
export const ensureIdentityAfterPasswordLogin = safeAsync('ensureIdentityAfterPasswordLogin', ensureIdentityAfterPasswordLoginImpl);
export const ensureIdentityAfterPasswordLoginV2 = safeAsync('ensureIdentityAfterPasswordLoginV2', ensureIdentityAfterPasswordLoginV2Impl);
export const ensureIdentityAfterKeyfileLogin = safeAsync('ensureIdentityAfterKeyfileLogin', ensureIdentityAfterKeyfileLoginImpl);
export const ensureIdentityAfterRecoveryLogin = safeAsync('ensureIdentityAfterRecoveryLogin', ensureIdentityAfterRecoveryLoginImpl);
export const rewrapIdentityAfterLegacyRecoveryRegenerate = safeAsync(
  'rewrapIdentityAfterLegacyRecoveryRegenerate',
  rewrapIdentityAfterLegacyRecoveryRegenerateImpl,
);
export const clearIdentity = safeAsync('clearIdentity', clearIdentityImpl);
