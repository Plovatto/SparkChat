export { getCurrentIdentity, subscribeCurrentIdentity } from './current-identity';
export {
  clearIdentity,
  ensureIdentityAfterKeyfileLogin,
  ensureIdentityAfterPasswordLogin,
  ensureIdentityAfterPasswordLoginV2,
  ensureIdentityAfterRecoveryLogin,
  hydrateCurrentIdentity,
  resolveIdentityForRewrap,
  rewrapIdentityAfterLegacyRecoveryRegenerate,
  setupIdentityAfterRegister,
} from './setup-identity';
export {
  buildRecoveryFile,
  derivePasswordCredentials,
  deriveRecoveryCredentials,
  InvalidRecoveryFileError,
  parseRecoveryFile,
  type RecoveryFileContents,
} from './credentials';
export {
  createPasswordMaterial,
  createRecoveryMaterial,
  prepareRegistrationCredentials,
  upgradeLegacyCredentials,
  type RegistrationCredentials,
  type UpgradedCredentials,
} from './credential-flows';
export {
  clearRoomKeys,
  ensureRoomKeyForDecryption,
  establishGroupRoomKeyOnCreate,
  establishPrivateRoomKey,
  handleGroupUserJoined,
  handleIncomingRoomKeyPush,
  handleKeyRequest,
  handleRoomKeyRejected,
  MissingRoomKeyError,
  requestGroupRoomKeyIfMissing,
  subscribeRoomKeyAvailable,
  trackRoomParticipants,
  type RoomKeyAvailableListener,
} from './room-keys';
export {
  decryptMediaContentIfNeeded,
  decryptMessageView,
  decryptMessageViews,
  decryptRoomSummaries,
  decryptRoomSummary,
  encryptOutgoingMessage,
  isEncryptedMediaUrl,
} from './message-crypto';
export { encryptAttachment } from './attachment-crypto';
export { downloadMessageMedia, resolveDownloadableMediaUrl, UndecryptableMediaError, type MessageMediaDownload } from './media-download';
