import type { AppSocket } from '@lib/socket';
import { setCurrentIdentity } from './current-identity';
import { clearPrivateKey, loadPrivateKey, savePrivateKey } from './key-store';
import { safeAsync } from './safe-async';
import {
  generateIdentity,
  unwrapPrivateKeyWithPassword,
  unwrapPrivateKeyWithRecoveryToken,
  wrapPrivateKeyWithPassword,
  wrapPrivateKeyWithRecoveryToken,
} from './identity';

const MY_KEYS_TIMEOUT_MS = 8000;

interface MyKeysPayload {
  publicKey: string | null;
  encryptedPrivateKeyByPassword: string | null;
  encryptedPrivateKeyByRecovery: string | null;
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

async function setupIdentityAfterRegisterImpl(
  socket: AppSocket,
  userId: string,
  password: string,
  recoveryToken: string,
): Promise<void> {
  const identity = await generateIdentity();
  const [encryptedPrivateKeyByPassword, encryptedPrivateKeyByRecovery] = await Promise.all([
    wrapPrivateKeyWithPassword(identity.privateKey, password),
    wrapPrivateKeyWithRecoveryToken(identity.privateKey, recoveryToken),
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

async function ensureIdentityAfterPasswordLoginImpl(socket: AppSocket, userId: string, password: string): Promise<void> {
  const cached = await loadPrivateKey(userId);
  if (cached) {
    setCurrentIdentity({ userId, publicKey: cached.publicKey, privateKey: cached.privateKey });
    return;
  }

  const myKeys = await requestMyKeys(socket);
  if (!myKeys?.publicKey || !myKeys.encryptedPrivateKeyByPassword) {
    return;
  }

  const privateKey = await unwrapPrivateKeyWithPassword(myKeys.encryptedPrivateKeyByPassword, password);
  await savePrivateKey(userId, myKeys.publicKey, privateKey);
  setCurrentIdentity({ userId, publicKey: myKeys.publicKey, privateKey });
}

async function ensureIdentityAfterKeyfileLoginImpl(socket: AppSocket, userId: string, recoveryToken: string): Promise<void> {
  const cached = await loadPrivateKey(userId);
  if (cached) {
    setCurrentIdentity({ userId, publicKey: cached.publicKey, privateKey: cached.privateKey });
    return;
  }

  const myKeys = await requestMyKeys(socket);
  if (!myKeys?.publicKey || !myKeys.encryptedPrivateKeyByRecovery) {
    return;
  }

  const privateKey = await unwrapPrivateKeyWithRecoveryToken(myKeys.encryptedPrivateKeyByRecovery, recoveryToken);
  await savePrivateKey(userId, myKeys.publicKey, privateKey);
  setCurrentIdentity({ userId, publicKey: myKeys.publicKey, privateKey });
}

async function rewrapIdentityAfterPasswordChangeImpl(
  socket: AppSocket,
  userId: string,
  newPassword: string,
  newRecoveryToken: string,
): Promise<void> {
  let cached = await loadPrivateKey(userId);

  if (!cached) {
    const myKeys = await requestMyKeys(socket);
    if (myKeys?.publicKey) {
      return;
    }

    const identity = await generateIdentity();
    cached = { publicKey: identity.publicKey, privateKey: identity.privateKey };
  }

  const [encryptedPrivateKeyByPassword, encryptedPrivateKeyByRecovery] = await Promise.all([
    wrapPrivateKeyWithPassword(cached.privateKey, newPassword),
    wrapPrivateKeyWithRecoveryToken(cached.privateKey, newRecoveryToken),
  ]);

  await savePrivateKey(userId, cached.publicKey, cached.privateKey);
  setCurrentIdentity({ userId, publicKey: cached.publicKey, privateKey: cached.privateKey });
  socket.emit('e2e:publish-keys', {
    publicKey: cached.publicKey,
    encryptedPrivateKeyByPassword,
    encryptedPrivateKeyByRecovery,
  });
}

async function rewrapIdentityAfterRecoveryRegenerateImpl(
  socket: AppSocket,
  userId: string,
  newRecoveryToken: string,
): Promise<void> {
  const cached = await loadPrivateKey(userId);
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
export const ensureIdentityAfterKeyfileLogin = safeAsync('ensureIdentityAfterKeyfileLogin', ensureIdentityAfterKeyfileLoginImpl);
export const rewrapIdentityAfterPasswordChange = safeAsync('rewrapIdentityAfterPasswordChange', rewrapIdentityAfterPasswordChangeImpl);
export const rewrapIdentityAfterRecoveryRegenerate = safeAsync(
  'rewrapIdentityAfterRecoveryRegenerate',
  rewrapIdentityAfterRecoveryRegenerateImpl,
);
export const clearIdentity = safeAsync('clearIdentity', clearIdentityImpl);
