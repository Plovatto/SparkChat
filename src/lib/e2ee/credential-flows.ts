import type { AppSocket, SocketErrorPayload } from '@lib/socket';
import {
  deriveRecoveryCredentials,
  derivePasswordCredentials,
  generateAuthSalt,
  generateRecoverySecret,
  wrapPrivateKeyV2,
} from './credentials';
import { resolveIdentityForRewrap, type ResolvedIdentity } from './setup-identity';

const UPGRADE_TIMEOUT_MS = 20000;

export interface PasswordMaterial {
  authSalt: string;
  authKey: string;
  encryptedPrivateKeyByPassword: string;
}

export interface RecoveryMaterial {
  secret: Uint8Array;
  recoveryVerifier: string;
  encryptedPrivateKeyByRecovery: string;
}

export interface RegistrationCredentials {
  authSalt: string;
  authKey: string;
  wrapKey: Uint8Array;
  recoverySecret: Uint8Array;
  recoveryVerifier: string;
  recoveryWrapKey: Uint8Array;
}

export interface UpgradedCredentials {
  authSalt: string;
  recoverySecret: Uint8Array;
}

export async function prepareRegistrationCredentials(password: string): Promise<RegistrationCredentials> {
  const [authSalt, recoverySecret] = await Promise.all([generateAuthSalt(), generateRecoverySecret()]);
  const { authKey, wrapKey } = await derivePasswordCredentials(password, authSalt);
  const { recoveryKey, recoveryWrapKey } = await deriveRecoveryCredentials(recoverySecret);
  return { authSalt, authKey, wrapKey, recoverySecret, recoveryVerifier: recoveryKey, recoveryWrapKey };
}

export async function createPasswordMaterial(identity: ResolvedIdentity, userId: string, password: string): Promise<PasswordMaterial> {
  const authSalt = await generateAuthSalt();
  const { authKey, wrapKey } = await derivePasswordCredentials(password, authSalt);
  try {
    const encryptedPrivateKeyByPassword = await wrapPrivateKeyV2(identity.privateKey, wrapKey, userId, identity.publicKey);
    return { authSalt, authKey, encryptedPrivateKeyByPassword };
  } finally {
    wrapKey.fill(0);
  }
}

export async function createRecoveryMaterial(identity: ResolvedIdentity, userId: string): Promise<RecoveryMaterial> {
  const secret = await generateRecoverySecret();
  const { recoveryKey, recoveryWrapKey } = await deriveRecoveryCredentials(secret);
  try {
    const encryptedPrivateKeyByRecovery = await wrapPrivateKeyV2(identity.privateKey, recoveryWrapKey, userId, identity.publicKey);
    return { secret, recoveryVerifier: recoveryKey, encryptedPrivateKeyByRecovery };
  } finally {
    recoveryWrapKey.fill(0);
  }
}

function waitForCredentialsUpgrade(socket: AppSocket): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.off('user:credentials-upgraded', handleUpgraded);
      socket.off('error', handleError);
      resolve(value);
    };

    const handleUpgraded = () => finish(true);
    const handleError = (payload: SocketErrorPayload) => {
      if (payload.event !== 'user:upgrade-credentials') {
        return;
      }
      finish(false);
    };

    socket.on('user:credentials-upgraded', handleUpgraded);
    socket.on('error', handleError);
    const timer = setTimeout(() => finish(false), UPGRADE_TIMEOUT_MS);
  });
}

export async function upgradeLegacyCredentials(socket: AppSocket, userId: string, password: string): Promise<UpgradedCredentials | null> {
  try {
    const identity = await resolveIdentityForRewrap(socket, userId);
    if (!identity) {
      return null;
    }

    const [passwordMaterial, recoveryMaterial] = await Promise.all([
      createPasswordMaterial(identity, userId, password),
      createRecoveryMaterial(identity, userId),
    ]);

    const upgraded = waitForCredentialsUpgrade(socket);
    socket.emit('user:upgrade-credentials', {
      currentPassword: password,
      newAuthSalt: passwordMaterial.authSalt,
      newAuthKey: passwordMaterial.authKey,
      encryptedPrivateKeyByPassword: passwordMaterial.encryptedPrivateKeyByPassword,
      recoveryVerifier: recoveryMaterial.recoveryVerifier,
      encryptedPrivateKeyByRecovery: recoveryMaterial.encryptedPrivateKeyByRecovery,
    });

    if (!(await upgraded)) {
      return null;
    }
    return { authSalt: passwordMaterial.authSalt, recoverySecret: recoveryMaterial.secret };
  } catch (error) {
    console.error('[e2e] upgradeLegacyCredentials failed', error);
    return null;
  }
}
