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
  theme: SocketUserTheme;
}

export type JoinPayload =
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
  lastSeen: string;
}

export type MessageType = 'text' | 'system' | 'image' | 'audio';

export type MessageStatus = 'sent' | 'delivered' | 'read';

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
  blockedBy: Record<string, string>;
  isBlockedBy: boolean;
  userBlocked: boolean;
  isMutuallyBlocked: boolean;
}

export interface ServerToClientEvents {
  'user:registered': (payload: { user: SocketUser; sessionToken: string; recoveryFile: string; authMethod: AuthMethod }) => void;
  'user:resumed': (payload: { user: SocketUser; authMethod: AuthMethod }) => void;
  'user:online': (payload: { userId: string; nickname: string; avatar: number }) => void;
  'user:offline': (payload: {
    userId: string;
    user: { id: string; status: SocketUserStatus; lastSeen: string };
  }) => void;
  'user:profile-updated': (payload: { userId: string; nickname: string; avatar: number }) => void;
  'user:profile-updated-success': (payload: { user: SocketUser; recoveryFile: string | null }) => void;
  'user:password-changed': (payload: { recoveryFile: string }) => void;
  'user:recovery-file-regenerated': (payload: { recoveryFile: string }) => void;
  'user:sessions': (payload: { sessions: SessionSummary[] }) => void;
  error: (payload: { message: string; clientTempId?: string }) => void;
  'rooms:list': (payload: { rooms: RoomSummary[] }) => void;
  'room:created': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:joined': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:new': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:deleted': (payload: { roomId: string }) => void;
  'group:left': (payload: { roomId: string }) => void;
  'group:user-joined': (payload: { roomId: string; participants: RoomParticipant[] }) => void;
  'group:user-left': (payload: { roomId: string; userId: string; userName: string; participants: RoomParticipant[] }) => void;
  'user:blocked': (payload: BlockStatusPayload) => void;
  'user:unblocked': (payload: BlockStatusPayload) => void;
  'message:new': (payload: MessageView & { clientTempId?: string }) => void;
  'message:mark-read-done': (payload: { roomId: string; unreadCount: number }) => void;
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
  'user:update-theme': (payload: SocketUserTheme) => void;
  'user:visibility': (payload: { visible: boolean }) => void;
  'user:change-password': (payload: { currentPassword?: string; newPassword: string }) => void;
  'user:regenerate-recovery-file': () => void;
  'user:list-sessions': () => void;
  'user:revoke-session': (payload: { sessionId: string }) => void;
  'rooms:get': () => void;
  'room:create-private': (payload: { targetNickname: string }) => void;
  'room:create-group': (payload: { roomName: string }) => void;
  'room:join-by-code': (payload: { roomCode: string }) => void;
  'room:delete': (payload: { roomId: string }) => void;
  'group:leave': (payload: { roomId: string }) => void;
  'user:block': (payload: { roomId: string; blockedUserId: string }) => void;
  'user:unblock': (payload: { roomId: string; blockedUserId: string }) => void;
  'message:send': (payload: {
    roomId: string;
    content: string;
    type?: Extract<MessageType, 'text' | 'image' | 'audio'>;
    duration?: number;
    replyToMessageId?: string;
    clientTempId?: string;
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
