export { SocketProvider } from './SocketProvider';
export { useSocket } from './socket-context';
export { isSocketAuthenticated, type AppSocket } from './socket-client';
export { markPreviewOnlyHandler } from './e2e-socket';
export type {
  AuthMethod,
  BlockStatusPayload,
  ClientToServerEvents,
  E2ePublicKeyEntry,
  MessageFileMeta,
  MessageLinkPreview,
  MessageReplySnapshot,
  MessageSender,
  MessageStatus,
  MessageType,
  MessageView,
  ProfileKeyEnvelopeSummary,
  RoomEncryptedAvatar,
  PushConfigPayload,
  PushSubscriptionWire,
  RoomKeyBatch,
  RoomParticipant,
  RoomSummary,
  RoomType,
  SealedRoomKeyEntry,
  SessionSummary,
  SocketErrorPayload,
  SocketUser,
  SocketUserStatus,
  SocketChatAppearance,
  SocketChatSettings,
  SocketUserTheme,
} from './socket-events';
