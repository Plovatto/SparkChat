export interface SocketUserTheme {
  baseTheme: string;
  colorTheme: string;
}

export type SocketUserStatus = 'online' | 'offline';

export interface SocketUser {
  id: string;
  nickname: string;
  avatar: number;
  status: SocketUserStatus;
  statusText: string | null;
  theme: SocketUserTheme;
}

type JoinPayload =
  | { mode: 'register'; nickname: string; avatar: number; password: string }
  | { mode: 'resume'; userId: string; sessionToken: string };

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
}

export type MessageType = 'text' | 'system' | 'image' | 'audio' | 'file' | 'error';

export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface MessageFileMeta {
  name: string;
  mimeType: string;
  size: number;
  thumbnailUrl?: string;
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
}

export interface MessageReplySnapshot {
  id: string;
  content: string;
  type: MessageType;
  duration: number | null;
  fileMeta: MessageFileMeta | null;
  caption: string | null;
  sender: MessageSender;
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
  roomCode?: string;
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
}

export interface E2ePublicKeyEntry {
  userId: string;
  publicKey: string;
}

export interface ServerToClientEvents {
  'user:registered': (payload: {
    user: SocketUser;
    sessionToken: string;
    recoveryFile: string;
    recoveryToken: string;
    authMethod: AuthMethod;
  }) => void;
  'user:resumed': (payload: { user: SocketUser; authMethod: AuthMethod }) => void;
  'user:online': (payload: { userId: string; nickname: string; avatar: number }) => void;
  'user:offline': (payload: {
    userId: string;
    user: { id: string; status: SocketUserStatus; lastSeen: string };
  }) => void;
  'user:profile-updated': (payload: { userId: string; nickname: string; avatar: number; statusText: string | null }) => void;
  'user:profile-updated-success': (payload: { user: SocketUser; recoveryFile: string | null; recoveryToken: string | null }) => void;
  'user:password-changed': (payload: { recoveryFile: string; recoveryToken: string }) => void;
  'user:recovery-file-regenerated': (payload: { recoveryFile: string; recoveryToken: string }) => void;
  'user:sessions': (payload: { sessions: SessionSummary[] }) => void;
  'user:session-revoked': () => void;
  'e2e:public-keys': (payload: { keys: E2ePublicKeyEntry[] }) => void;
  'e2e:my-keys': (payload: {
    publicKey: string | null;
    encryptedPrivateKeyByPassword: string | null;
    encryptedPrivateKeyByRecovery: string | null;
  }) => void;
  error: (payload: { message: string; clientTempId?: string }) => void;
  'rooms:list': (payload: { rooms: RoomSummary[] }) => void;
  'room:created': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:joined': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:new': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:deleted': (payload: { roomId: string }) => void;
  'group:left': (payload: { roomId: string }) => void;
  'group:user-joined': (payload: { roomId: string; participants: RoomParticipant[] }) => void;
  'group:user-left': (payload: { roomId: string; userId: string; userName: string; participants: RoomParticipant[] }) => void;
  'group:participants-updated': (payload: { roomId: string; participants: RoomParticipant[] }) => void;
  'user:blocked': (payload: BlockStatusPayload) => void;
  'user:unblocked': (payload: BlockStatusPayload) => void;
  'e2e:room-keys': (payload: { keys: { roomId: string; sealedKey: string }[] }) => void;
  'e2e:room-key': (payload: { roomId: string; sealedKey: string }) => void;
  'e2e:key-request': (payload: { roomId: string; requesterId: string }) => void;
  'message:new': (payload: MessageView & { clientTempId?: string }) => void;
  'message:mark-read-done': (payload: { roomId: string; unreadCount: number; mentionCount: number }) => void;
  'message:read-receipt': (payload: { roomId: string; userId: string }) => void;
  'messages:list': (payload: { roomId: string; messages: MessageView[]; hasMore: boolean }) => void;
  'typing:update': (payload: { roomId: string; users: string[] }) => void;
  'recording:update': (payload: { roomId: string; users: string[] }) => void;
  'message:deleted': (payload: { messageId: string; roomId: string }) => void;
  'message:updated': (payload: MessageView) => void;
}

export interface ClientToServerEvents {
  'user:join': (payload: JoinPayload) => void;
  'user:update-profile': (payload: { nickname: string; avatar: number }) => void;
  'user:update-status-text': (payload: { statusText: string }) => void;
  'user:update-theme': (payload: SocketUserTheme) => void;
  'user:visibility': (payload: { visible: boolean }) => void;
  'user:change-password': (payload: { currentPassword?: string; newPassword: string }) => void;
  'user:regenerate-recovery-file': () => void;
  'user:list-sessions': () => void;
  'user:revoke-session': (payload: { sessionId: string }) => void;
  'e2e:publish-keys': (payload: {
    publicKey?: string;
    encryptedPrivateKeyByPassword?: string;
    encryptedPrivateKeyByRecovery?: string;
  }) => void;
  'e2e:get-public-keys': (payload: { userIds: string[] }) => void;
  'e2e:get-my-keys': () => void;
  'rooms:get': () => void;
  'room:create-private': (payload: { targetNickname: string }) => void;
  'room:create-group': (payload: { roomName: string }) => void;
  'room:join-by-code': (payload: { roomCode: string }) => void;
  'room:delete': (payload: { roomId: string }) => void;
  'group:leave': (payload: { roomId: string }) => void;
  'group:remove-member': (payload: { roomId: string; userId: string }) => void;
  'group:promote-admin': (payload: { roomId: string; userId: string }) => void;
  'user:block': (payload: { roomId: string; blockedUserId: string }) => void;
  'user:unblock': (payload: { roomId: string; blockedUserId: string }) => void;
  'e2e:publish-room-key': (payload: { roomId: string; keys: { userId: string; sealedKey: string }[] }) => void;
  'e2e:get-room-keys': (payload: { roomIds: string[] }) => void;
  'e2e:request-room-key': (payload: { roomId: string }) => void;
  'message:send': (payload: {
    roomId: string;
    content: string;
    type?: Extract<MessageType, 'text' | 'image' | 'audio' | 'file'>;
    duration?: number;
    replyToMessageId?: string;
    clientTempId?: string;
    fileMeta?: MessageFileMeta;
    mentionedUserIds?: string[];
    caption?: string;
    linkPreview?: MessageLinkPreview;
  }) => void;
  'message:mark-read': (payload: { roomId: string; messageIds?: string[] }) => void;
  'messages:get': (payload: { roomId: string; before?: string; limit?: number }) => void;
  'typing:start': (payload: { roomId: string }) => void;
  'typing:stop': (payload: { roomId: string }) => void;
  'recording:start': (payload: { roomId: string }) => void;
  'recording:stop': (payload: { roomId: string }) => void;
  'audio:played': (payload: { messageId: string }) => void;
  'message:delete': (payload: { messageId: string }) => void;
  'room:view-start': (payload: { roomId: string }) => void;
  'room:view-stop': (payload: { roomId: string }) => void;
}
