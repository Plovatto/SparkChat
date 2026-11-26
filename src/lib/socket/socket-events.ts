import type { ApiErrorParams } from '@lib/api/api-error';
import type { AssistantCard, QuickReply, QuickReplyChoice } from '@lib/assistant/assistant-card';
import type { SystemEvent } from '@lib/format/system-event';

export interface SocketErrorPayload {
  message: string;
  code?: string;
  params?: ApiErrorParams;
  clientTempId?: string;
  event?: string;
  messageId?: string;
  messageIds?: string[];
}

export interface MessageHiddenPayload {
  roomId: string;
  messageIds: string[];
  lastMessage?: MessageView | null;
  unreadCount?: number;
  mentionCount?: number;
}

export interface KtSignedTreeHeadWire {
  size: number;
  root: string;
  issuedAt: number;
  signature: string;
}

export interface KtConfigPayload {
  enabled: boolean;
  logPublicKey: string;
}

export type KtProofWire =
  | { userId: string; found: true; position: number; version: number; proof: string[] }
  | { userId: string; found: false };

export interface KtAuditEntryWire {
  position: number;
  version: number;
  publicKey: string;
  signingPublicKey: string | null;
  proof: string[];
}

export interface PushConfigPayload {
  enabled: boolean;
  publicKey: string | null;
}

export interface PushSubscriptionWire {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

export interface SocketUserTheme {
  baseTheme: string;
  colorTheme: string;
}

export type SocketUserStatus = 'online' | 'offline';

export interface SocketChatAppearance {
  overlayOpacity: number;
  overlayBlur: number;
  ownBubbleColor: string | null;
  ownBubbleOpacity: number;
  ownTextIntensity: number | null;
  otherBubbleColor: string | null;
  otherBubbleOpacity: number;
  otherTextIntensity: number | null;
  bubbleBlur: number;
}

export interface SocketChatSettings {
  roomWallpapers: Record<string, string>;
  globalWallpaper: string | null;
  roomAppearance: Record<string, SocketChatAppearance>;
  globalAppearance: SocketChatAppearance | null;
}

export interface SocketUser {
  id: string;
  nickname: string;
  avatar: number;
  status: SocketUserStatus;
  statusText: string | null;
  theme: SocketUserTheme;
  chatSettings: SocketChatSettings | null;
  encryptedAvatar?: string | null;
  profileKeyVersion?: number;
}

type JoinPayload =
  | {
      mode: 'register';
      nickname: string;
      avatar: number;
      password: string;
      authSalt: string;
      recoveryVerifier: string;
      passwordLength?: number;
      devicePublicKey?: string;
    }
  | { mode: 'resume'; userId: string; sessionToken: string; proof?: { timestamp: number; nonce: string; signature: string } };

export type AuthMethod = 'password' | 'keyfile';

export interface SessionSummary {
  id: string;
  authMethod: AuthMethod;
  device: string;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

export type RoomType = 'private' | 'group';

export interface RoomParticipant {
  id: string;
  nickname: string;
  avatar: number;
  status: SocketUserStatus;
  statusText: string | null;
  lastSeen: string;
  isAdmin: boolean;
  encryptedAvatar?: string | null;
  profileKeyVersion?: number;
  profileKeyEnvelope?: ProfileKeyEnvelopeSummary | null;
}

export interface ProfileKeyEnvelopeSummary {
  envelope: string;
  keyId: string;
}

export interface RoomEncryptedAvatar {
  encryptedAvatar: string;
  keyId: string;
}

export type MessageType = 'text' | 'system' | 'image' | 'audio' | 'file' | 'error';

export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface MessageFileMeta {
  name: string;
  mimeType: string;
  size: number;
  thumbnailUrl?: string;
  key?: string;
  thumbnailKey?: string;
  previewKey?: string;
}

export interface MessageLinkPreview {
  url: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

export interface MessageSender {
  id: string;
  nickname: string;
  avatar: number | null;
  unknown?: boolean;
}

export interface MessageReplySnapshot {
  id: string;
  content: string;
  type: MessageType;
  duration: number | null;
  fileMeta: MessageFileMeta | null;
  caption: string | null;
  sender: MessageSender;
  deleted?: boolean;
}

export interface MessageReaction {
  userId: string;
  emoji: string;
  updatedAt: string;
}

export interface MessageReactionsUpdatedPayload {
  roomId: string;
  messageId: string;
  messageTimestamp?: string;
  reactions: MessageReaction[];
}

export interface MessageView {
  id: string;
  roomId: string;
  sender: MessageSender;
  content: string;
  type: MessageType;
  duration: number | null;
  timestamp: string;
  deletedForEveryone: boolean;
  status: MessageStatus;
  deliveredTo: string[];
  readBy: string[];
  playedBy: string[];
  replyTo: MessageReplySnapshot | null;
  mentionedUserIds: string[];
  fileMeta: MessageFileMeta | null;
  caption: string | null;
  linkPreview: MessageLinkPreview | null;
  systemEvent?: SystemEvent | null;
  eventTrust?: 'verified' | 'legacy' | 'unverified' | 'forged';
  unencrypted?: boolean;
  reactions?: MessageReaction[];
  assistantCard?: string;
  card?: AssistantCard | null;
  resolvedChoice?: QuickReplyChoice;
}

export interface BlockStatusPayload {
  roomId: string;
  blockedUserId?: string;
  blockedByUserId?: string;
  blockedBy: Record<string, string>;
  isBlocking: boolean;
}

export interface RoomSummary {
  id: string;
  type: RoomType;
  name?: string;
  createdBy?: string;
  creatorId?: string;
  participants: RoomParticipant[];
  lastMessage: MessageView | null;
  unreadCount: number;
  mentionCount: number;
  blockedBy: Record<string, string>;
  isBlockedBy: boolean;
  userBlocked: boolean;
  isMutuallyBlocked: boolean;
  currentEpoch?: number;
  currentKeyId?: string | null;
  rotationRequiredEpoch?: number | null;
  invite?: RoomInviteSummary | null;
  roster?: RoomRosterSummary | null;
  inviteProofs?: RoomInviteProof[];
  encryptedName?: RoomEncryptedName | null;
  encryptedAvatar?: RoomEncryptedAvatar | null;
}

export interface RoomEncryptedName {
  encryptedName: string;
  keyId: string;
}

export interface RoomRosterSummary {
  encryptedRoster: string;
  keyId: string;
}

export interface RoomInviteProof {
  userId: string;
  proof: string;
}

export interface RoomInviteSummary {
  encryptedInvite: string;
  keyId: string;
  active: boolean;
}

export interface RoomInviteUpdate {
  tokenHash: string;
  encryptedInvite: string;
}

export interface SealedRoomKeyEntry {
  roomId: string;
  keyId: string;
  epoch: number;
  senderId: string;
  sealedKey: string;
  roster?: string | null;
}

export interface RoomKeyBatch {
  roomId: string;
  keyId: string;
  epoch: number;
  keys: { userId: string; sealedKey: string }[];
}

export interface PublishRoomKeyBatch extends RoomKeyBatch {
  invite?: RoomInviteUpdate;
  roster?: string;
  name?: string;
}

export interface E2ePublicKeyEntry {
  userId: string;
  publicKey: string;
  signingPublicKey?: string;
  keySignature?: string;
}

export type CallKindWire = 'voice' | 'video';
export type CallEndReasonWire = 'completed' | 'missed' | 'declined' | 'cancelled' | 'busy' | 'failed' | 'connection-lost';
export type CallDegradeWire = 'none' | 'video-360' | 'audio-only-relay';

export interface CallConfigPayload {
  enabled: boolean;
  relayAvailable: boolean;
  degrade?: CallDegradeWire | null;
}

export interface CallIceServerEntry {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface CallIceServersResult {
  callId: string;
  iceServers: CallIceServerEntry[];
  expiresAt: string;
  relayOnly: boolean;
  degrade?: CallDegradeWire | null;
}

export interface CallMediaStateWire {
  muted: boolean;
  camera: boolean;
}

export interface CallStatePayload {
  callId: string;
  state: 'ringing' | 'accepted' | 'active';
  roomId: string;
  kind: CallKindWire;
  peerId: string;
  role: 'caller' | 'callee';
  answeredAt?: string | null;
  transferable?: boolean;
  resumable?: boolean;
  peerLive?: boolean;
  media?: CallMediaStateWire;
}

export interface ServerToClientEvents {
  'push:config': (payload: PushConfigPayload) => void;
  'push:subscribed': (payload: { endpoint: string }) => void;
  'push:unsubscribed': (payload: { endpoint: string }) => void;
  'user:registered': (payload: {
    user: SocketUser;
    sessionToken: string;
    authMethod: AuthMethod;
    deviceKeyBound?: boolean;
  }) => void;
  'user:resumed': (payload: { user: SocketUser; authMethod: AuthMethod }) => void;
  'user:auth-failed': (payload: SocketErrorPayload & { mode: 'register' | 'resume'; reason: 'invalid' | 'temporary' }) => void;
  'user:online': (payload: { userId: string; nickname: string; avatar: number }) => void;
  'user:offline': (payload: {
    userId: string;
    user: { id: string; status: SocketUserStatus; lastSeen: string };
  }) => void;
  'user:profile-updated': (payload: { userId: string; nickname: string; avatar: number; statusText: string | null }) => void;
  'user:profile-updated-success': (payload: { user: SocketUser }) => void;
  'user:password-changed': () => void;
  'user:recovery-file-regenerated': () => void;
  'user:sessions': (payload: { sessions: SessionSummary[] }) => void;
  'user:session-revoked': () => void;
  'user:theme-updated': (payload: SocketUserTheme) => void;
  'user:chat-settings-updated': (payload: { chatSettings: SocketChatSettings }) => void;
  'e2e:public-keys': (payload: { keys: E2ePublicKeyEntry[] }) => void;
  'kt:config': (payload: KtConfigPayload) => void;
  'kt:head': (payload: { requestId?: string; head: KtSignedTreeHeadWire }) => void;
  'kt:proofs': (payload: { requestId?: string; head: KtSignedTreeHeadWire; proofs: KtProofWire[] }) => void;
  'kt:consistency': (payload: { requestId?: string; first: number; second: number; proof: string[] | null }) => void;
  'kt:audit': (payload: { requestId?: string; head: KtSignedTreeHeadWire; entries: KtAuditEntryWire[]; truncated: boolean }) => void;
  'kt:gossip': (payload: { from: string; envelope: string }) => void;
  'e2e:my-keys': (payload: {
    publicKey: string | null;
    encryptedPrivateKeyByPassword: string | null;
    encryptedPrivateKeyByRecovery: string | null;
  }) => void;
  error: (payload: SocketErrorPayload) => void;
  'rooms:list': (payload: { rooms: RoomSummary[] }) => void;
  'room:created': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:joined': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:new': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:deleted': (payload: { roomId: string }) => void;
  'group:left': (payload: { roomId: string }) => void;
  'group:user-joined': (payload: { roomId: string; participants: RoomParticipant[] }) => void;
  'group:user-left': (payload: {
    roomId: string;
    userId: string;
    userName: string;
    participants: RoomParticipant[];
  }) => void;
  'group:participants-updated': (payload: { roomId: string; participants: RoomParticipant[] }) => void;
  'user:blocked': (payload: BlockStatusPayload) => void;
  'user:unblocked': (payload: BlockStatusPayload) => void;
  'e2e:room-keys': (payload: { keys: SealedRoomKeyEntry[]; truncated?: boolean }) => void;
  'e2e:room-key': (payload: SealedRoomKeyEntry) => void;
  'e2e:key-request': (payload: { roomId: string; requesterId: string; proof?: string | null }) => void;
  'room:name-updated': (payload: { roomId: string; encryptedName: string; keyId: string }) => void;
  'user:avatar-updated': (payload: { userId: string; encryptedAvatar: string | null; profileKeyVersion: number }) => void;
  'room:avatar-updated': (payload: { roomId: string; encryptedAvatar: string | null; keyId: string | null }) => void;
  'room:profile-keys-updated': (payload: { roomId: string; keyId: string; envelopes: Record<string, string> }) => void;
  'room:invite-updated': (payload: { roomId: string; invite: RoomInviteSummary | null; roster?: RoomRosterSummary | null }) => void;
  'e2e:room-key-rejected': (payload: {
    roomId: string;
    epoch: number;
    keyId: string;
    message: string;
    code: string;
    event: string;
    currentEpoch: number;
    currentKeyId: string | null;
    rotationRequiredEpoch: number | null;
    retryAfterMs?: number;
  }) => void;
  'e2e:rotation-required': (payload: { roomId: string; epoch: number; memberIds?: string[]; inviteProofs?: RoomInviteProof[] }) => void;
  'message:new': (payload: MessageView & { clientTempId?: string }) => void;
  'message:mark-read-done': (payload: { roomId: string; unreadCount: number; mentionCount: number }) => void;
  'message:read-receipt': (payload: { roomId: string; userId: string }) => void;
  'messages:list': (payload: { roomId: string; messages: MessageView[]; hasMore: boolean }) => void;
  'typing:update': (payload: { roomId: string; users: string[] }) => void;
  'recording:update': (payload: { roomId: string; users: string[] }) => void;
  'message:deleted': (payload: { messageId: string; roomId: string }) => void;
  'message:card-resolved': (payload: { roomId: string; cardId: string; choice: QuickReplyChoice }) => void;
  'message:hidden': (payload: MessageHiddenPayload) => void;
  'message:updated': (payload: MessageView) => void;
  'message:reactions-updated': (payload: MessageReactionsUpdatedPayload) => void;
  'call:config': (payload: CallConfigPayload) => void;
  'call:incoming': (payload: { callId: string; roomId: string; kind: CallKindWire; callerId: string; envelope: string; ringExpiresAt: string }) => void;
  'call:accepted': (payload: { callId: string; envelope: string; deviceId: string }) => void;
  'call:answered-elsewhere': (payload: { callId: string }) => void;
  'call:declined-elsewhere': (payload: { callId: string }) => void;
  'call:signal': (payload: { callId: string; from: string; envelope: string }) => void;
  'call:ended': (payload: { callId: string; reason: CallEndReasonWire; endedAt: string }) => void;
  'call:state': (payload: CallStatePayload | null) => void;
  'call:transferred': (payload: { callId: string }) => void;
  'call:peer-transfer': (payload: { callId: string; from: string; envelope: string }) => void;
  'call:transfer-accepted': (payload: { callId: string; envelope: string }) => void;
  'call:transfer-failed': (payload: { callId: string }) => void;
  'call:ice-servers-result': (payload: CallIceServersResult) => void;
}

export interface ClientToServerEvents {
  'push:config': () => void;
  'push:subscribe': (payload: { subscription: PushSubscriptionWire }) => void;
  'push:unsubscribe': (payload: { endpoint: string }) => void;
  'user:join': (payload: JoinPayload) => void;
  'user:update-profile': (payload: { nickname: string; avatar: number; currentPassword?: string }) => void;
  'user:update-status-text': (payload: { statusText: string }) => void;
  'user:update-theme': (payload: SocketUserTheme) => void;
  'user:update-chat-settings': (payload: SocketChatSettings) => void;
  'user:logout': () => void;
  'user:visibility': (payload: { visible: boolean; attentive?: boolean }, ack?: () => void) => void;
  'user:change-password': (payload: {
    currentPassword?: string;
    newPassword: string;
    passwordLength?: number;
    newAuthSalt: string;
    encryptedPrivateKeyByPassword: string;
  }) => void;
  'user:regenerate-recovery-file': (payload: {
    currentPassword: string;
    recoveryVerifier: string;
    encryptedPrivateKeyByRecovery: string;
  }) => void;
  'user:list-sessions': () => void;
  'user:revoke-session': (payload: { sessionId: string }) => void;
  'e2e:publish-keys': (payload: {
    publicKey?: string;
    signingPublicKey?: string;
    keySignature?: string;
    encryptedPrivateKeyByPassword?: string;
    encryptedPrivateKeyByRecovery?: string;
  }) => void;
  'e2e:publish-signing-key': (payload: { signingPublicKey: string; keySignature: string }) => void;
  'e2e:get-public-keys': (payload: { userIds: string[] }) => void;
  'kt:get-head': (payload?: { requestId?: string }) => void;
  'kt:get-proofs': (payload: {
    requestId?: string;
    treeSize?: number;
    items: { userId: string; publicKey: string; signingPublicKey?: string }[];
  }) => void;
  'kt:get-consistency': (payload: { requestId?: string; first: number; second: number }) => void;
  'kt:audit': (payload?: { requestId?: string; fromVersion?: number }) => void;
  'kt:gossip': (payload: { to: string; envelope: string }) => void;
  'e2e:get-my-keys': () => void;
  'rooms:get': () => void;
  'room:create-private': (payload: { targetNickname: string }) => void;
  'room:create-group': (payload: { roomName: string }) => void;
  'room:join-by-invite': (payload: { roomId: string; inviteToken: string; proof: string; attestation?: string }) => void;
  'room:reset-invite': (payload: { roomId: string }) => void;
  'room:delete': (payload: { roomId: string }) => void;
  'group:leave': (payload: { roomId: string; attestation?: string }) => void;
  'group:remove-member': (payload: { roomId: string; userId: string; attestation?: string }) => void;
  'group:promote-admin': (payload: { roomId: string; userId: string; attestation?: string }) => void;
  'user:block': (payload: { roomId: string; blockedUserId: string }) => void;
  'user:unblock': (payload: { roomId: string; blockedUserId: string }) => void;
  'e2e:publish-room-key': (payload: PublishRoomKeyBatch) => void;
  'e2e:share-room-key': (payload: RoomKeyBatch) => void;
  'e2e:get-room-keys': (payload: { roomIds: string[]; keyIds?: Record<string, string[]> }) => void;
  'room:rename': (payload: { roomId: string; name: string; keyId: string }) => void;
  'user:set-avatar': (payload: { url: string; encryptedAvatar: string; profileKeyVersion: number }) => void;
  'user:clear-avatar': (payload: Record<string, never>) => void;
  'room:set-avatar': (payload: { roomId: string; url: string; encryptedAvatar: string; keyId: string }) => void;
  'room:clear-avatar': (payload: { roomId: string }) => void;
  'room:publish-profile-key': (payload: { roomId: string; keyId: string; envelope: string }) => void;
  'room:rewrap-profile-keys': (payload: { roomId: string; keyId: string; envelopes: Record<string, string> }) => void;
  'e2e:request-room-key': (payload: { roomId: string }) => void;
  'e2e:report-bad-key': (payload: { roomId: string; keyId: string }) => void;
  'message:send': (payload: {
    roomId: string;
    content: string;
    type?: Extract<MessageType, 'text' | 'image' | 'audio' | 'file'>;
    duration?: number;
    replyToMessageId?: string;
    messageId?: string;
    clientTempId?: string;
    fileMeta?: MessageFileMeta;
    mentionedUserIds?: string[];
    caption?: string;
    linkPreview?: MessageLinkPreview;
    attachmentUrls?: string[];
    quickReply?: QuickReply;
  }) => void;
  'message:schedule': (payload: {
    cardId: string;
    roomId: string;
    sendAt: number;
    messageId?: string;
    content: string;
    type: 'text';
    clientTempId?: string;
  }) => void;
  'message:unschedule': (payload: { id: string }) => void;
  'message:mark-read': (payload: { roomId: string; messageIds?: string[] }) => void;
  'user:set-locale': (payload: { locale: 'pt' | 'en' }) => void;
  'user:set-timezone': (payload: { timeZone: string }) => void;
  'messages:get': (payload: { roomId: string; before?: string; limit?: number }) => void;
  'typing:start': (payload: { roomId: string }) => void;
  'typing:stop': (payload: { roomId: string }) => void;
  'recording:start': (payload: { roomId: string }) => void;
  'recording:stop': (payload: { roomId: string }) => void;
  'audio:played': (payload: { messageId: string }) => void;
  'message:delete': (payload: { messageId: string } | { messageIds: string[] }) => void;
  'message:hide': (payload: { messageIds: string[] }) => void;
  'message:react': (payload: { roomId: string; messageId: string; emoji: string | null }) => void;
  'room:view-start': (payload: { roomId: string }) => void;
  'room:view-stop': (payload: { roomId: string }) => void;
  'call:start': (payload: { callId: string; roomId: string; kind: CallKindWire; envelope: string }) => void;
  'call:accept': (payload: { callId: string; envelope: string }) => void;
  'call:decline': (payload: { callId: string }) => void;
  'call:silence': (payload: { callId: string }) => void;
  'call:hangup': (payload: { callId: string }) => void;
  'call:signal': (payload: { callId: string; to: string; envelope: string }) => void;
  'call:heartbeat': (payload: { callId: string; relayed?: boolean; media?: CallMediaStateWire }) => void;
  'call:sync': (payload: { callId?: string | null }) => void;
  'call:ice-servers': (payload: { callId: string; protectIp: boolean }) => void;
  'call:transfer': (payload: { callId: string; envelope: string }) => void;
  'call:transfer-accept': (payload: { callId: string; envelope: string }) => void;
}
