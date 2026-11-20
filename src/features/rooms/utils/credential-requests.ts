import { deriveCurrentPasswordProof } from '@features/auth/lib/auth-params';
import { createPasswordMaterial, createRecoveryMaterial, declaredPasswordLength, resolveIdentityForRewrap } from '@lib/e2ee';
import type { AppSocket, ClientToServerEvents } from '@lib/socket';

export type ChangePasswordPayload = Parameters<ClientToServerEvents['user:change-password']>[0];
export type RegenerateRecoveryPayload = Parameters<ClientToServerEvents['user:regenerate-recovery-file']>[0];

export class IdentityUnavailableError extends Error {
  constructor() {
    super('The encryption identity is not available on this device.');
    this.name = 'IdentityUnavailableError';
  }
}

interface AccountContext {
  socket: AppSocket;
  userId: string;
  nickname: string;
}

export interface ChangePasswordRequest {
  payload: ChangePasswordPayload;
  authSalt: string;
}

export interface RegenerateRecoveryRequest {
  payload: RegenerateRecoveryPayload;
  recoverySecret: Uint8Array;
}

async function requireIdentity(socket: AppSocket, userId: string) {
  const identity = await resolveIdentityForRewrap(socket, userId);
  if (!identity) {
    throw new IdentityUnavailableError();
  }
  return identity;
}

export async function buildChangePasswordRequest(
  { socket, userId, nickname }: AccountContext,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordRequest> {
  const identity = await requireIdentity(socket, userId);
  const currentProof = currentPassword ? await deriveCurrentPasswordProof(userId, nickname, currentPassword) : undefined;
  const passwordMaterial = await createPasswordMaterial(identity, userId, newPassword);

  return {
    payload: {
      currentPassword: currentProof,
      newPassword: passwordMaterial.authKey,
      passwordLength: declaredPasswordLength(newPassword),
      newAuthSalt: passwordMaterial.authSalt,
      encryptedPrivateKeyByPassword: passwordMaterial.encryptedPrivateKeyByPassword,
    },
    authSalt: passwordMaterial.authSalt,
  };
}

export async function buildRegenerateRecoveryRequest(
  { socket, userId, nickname }: AccountContext,
  currentPassword: string,
): Promise<RegenerateRecoveryRequest> {
  const proof = await deriveCurrentPasswordProof(userId, nickname, currentPassword);
  const identity = await requireIdentity(socket, userId);
  const recoveryMaterial = await createRecoveryMaterial(identity, userId);
  return {
    payload: {
      currentPassword: proof,
      recoveryVerifier: recoveryMaterial.recoveryVerifier,
      encryptedPrivateKeyByRecovery: recoveryMaterial.encryptedPrivateKeyByRecovery,
    },
    recoverySecret: recoveryMaterial.secret,
  };
}

export async function resolveProfileUpdateProof(userId: string, nickname: string, currentPassword: string): Promise<string> {
  return deriveCurrentPasswordProof(userId, nickname, currentPassword);
}
