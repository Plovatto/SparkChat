import type { AppSocket } from '@lib/socket';
import {
  buildRecoveryFile,
  deriveRecoveryCredentials,
  derivePasswordCredentials,
  generateAuthSalt,
  generateRecoverySecret,
  wrapPrivateKeyV2,
  type RecoveryFileContents,
} from './credentials';
import { setupIdentityAfterRegister, type ResolvedIdentity } from './setup-identity';

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

const consumedSecrets = new WeakSet<Uint8Array>();

function claimSecret(secret: Uint8Array): boolean {
  if (consumedSecrets.has(secret)) {
    return false;
  }
  consumedSecrets.add(secret);
  return true;
}

export async function buildRecoveryFileOnce(contents: RecoveryFileContents): Promise<string | null> {
  if (!claimSecret(contents.secret)) {
    return null;
  }
  try {
    return await buildRecoveryFile(contents);
  } finally {
    contents.secret.fill(0);
  }
}

export async function completeRegistration(
  socket: AppSocket,
  userId: string,
  nickname: string,
  credentials: RegistrationCredentials,
): Promise<string | null> {
  if (!claimSecret(credentials.wrapKey)) {
    return null;
  }
  void setupIdentityAfterRegister(socket, userId, credentials.wrapKey, credentials.recoveryWrapKey).finally(() => {
    credentials.wrapKey.fill(0);
    credentials.recoveryWrapKey.fill(0);
  });
  return buildRecoveryFileOnce({ userId, nickname, secret: credentials.recoverySecret });
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
