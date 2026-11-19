import { deriveCurrentPasswordProof, resolveAuthParams } from '@features/auth/lib/auth-params';
import { createPasswordMaterial, createRecoveryMaterial, resolveIdentityForRewrap } from '@lib/e2ee';
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
  upgradeRecoverySecret: Uint8Array | null;
}

export interface RegenerateRecoveryRequest {
  payload: RegenerateRecoveryPayload;
  recoverySecret: Uint8Array | null;
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
  const current = currentPassword ? await deriveCurrentPasswordProof(userId, nickname, currentPassword) : null;
  const params = current?.params ?? (await resolveAuthParams(userId, nickname));
  const passwordMaterial = await createPasswordMaterial(identity, userId, newPassword);
  const recoveryMaterial = params.version === 1 ? await createRecoveryMaterial(identity, userId) : null;

  return {
    payload: {
      currentPassword: current?.proof,
      newPassword: passwordMaterial.authKey,
      newAuthSalt: passwordMaterial.authSalt,
      encryptedPrivateKeyByPassword: passwordMaterial.encryptedPrivateKeyByPassword,
      ...(recoveryMaterial
        ? {
            recoveryVerifier: recoveryMaterial.recoveryVerifier,
            encryptedPrivateKeyByRecovery: recoveryMaterial.encryptedPrivateKeyByRecovery,
          }
        : {}),
    },
    authSalt: passwordMaterial.authSalt,
    upgradeRecoverySecret: recoveryMaterial?.secret ?? null,
  };
}

export async function buildRegenerateRecoveryRequest(
  { socket, userId, nickname }: AccountContext,
  currentPassword: string,
): Promise<RegenerateRecoveryRequest> {
  const { proof, params } = await deriveCurrentPasswordProof(userId, nickname, currentPassword);
  if (params.version === 1) {
    return { payload: { currentPassword: proof }, recoverySecret: null };
  }

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
  const { proof } = await deriveCurrentPasswordProof(userId, nickname, currentPassword);
  return proof;
}
