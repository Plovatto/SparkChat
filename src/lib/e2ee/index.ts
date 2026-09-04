export { getCurrentIdentity } from './current-identity';
export type { CurrentIdentity } from './current-identity';
export {
  clearIdentity,
  ensureIdentityAfterKeyfileLogin,
  ensureIdentityAfterPasswordLogin,
  hydrateCurrentIdentity,
  rewrapIdentityAfterPasswordChange,
  rewrapIdentityAfterRecoveryRegenerate,
  setupIdentityAfterRegister,
} from './setup-identity';
export {
  clearRoomKeys,
  ensureRoomKeyForDecryption,
  establishGroupRoomKeyOnCreate,
  establishPrivateRoomKey,
  handleGroupUserJoined,
  handleIncomingRoomKeyPush,
  handleKeyRequest,
  requestGroupRoomKeyIfMissing,
  trackRoomParticipants,
} from './room-keys';
export {
  decryptMessageView,
  decryptMessageViews,
  decryptRoomSummaries,
  decryptRoomSummary,
  encryptOutgoingContent,
  E2E_PREFIX,
} from './message-crypto';
export { encryptAttachmentIfPossible } from './attachment-crypto';
export type { EncryptedAttachment } from './attachment-crypto';
