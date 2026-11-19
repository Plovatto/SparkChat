export { getCurrentIdentity, subscribeCurrentIdentity } from './current-identity';
export {
  clearIdentity,
  ensureIdentityAfterKeyfileLogin,
  ensureIdentityAfterPasswordLogin,
  ensureIdentityAfterPasswordLoginV2,
  ensureIdentityAfterRecoveryLogin,
  ensureSigningKeyPublished,
  hydrateCurrentIdentity,
  resolveIdentityForRewrap,
  rewrapIdentityAfterLegacyRecoveryRegenerate,
  setupIdentityAfterRegister,
} from './setup-identity';
export {
  acceptContactKeyChange,
  getContactTrust,
  isKeyUsable,
  observeContactKey,
  setContactVerified,
  subscribeContactTrust,
  type ContactTrust,
  type ContactTrustStatus,
} from './contact-trust';
export { computeSafetyNumber, type SafetyNumber } from './safety-number';
export { lookupContactKey } from './room-keys';
export {
  buildRecoveryFile,
  derivePasswordCredentials,
  deriveRecoveryCredentials,
  InvalidRecoveryFileError,
  parseRecoveryFile,
  type RecoveryFileContents,
} from './credentials';
export {
  buildRecoveryFileOnce,
  completeRegistration,
  createPasswordMaterial,
  createRecoveryMaterial,
  prepareRegistrationCredentials,
  upgradeLegacyCredentials,
  type RegistrationCredentials,
  type UpgradedCredentials,
} from './credential-flows';
export {
  clearRoomKeys,
  ensureRoomKeyForSending,
  handleGroupUserJoined,
  handleKeyRequest,
  handleRoomKeyPush,
  handleRoomKeyRejected,
  handleRotationRequired,
  MissingRoomKeyError,
  recoverFromStaleRoomKey,
  subscribeRoomKeyAvailable,
  trackRoom,
  updateRoomParticipants,
  type RoomKeyAvailableListener,
  type RoomKeyGeneration,
  type RoomKeyRejection,
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
