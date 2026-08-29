export interface SocketUserTheme {
  baseTheme: string;
  colorTheme: string;
}

export type SocketUserStatus = 'online' | 'offline';

export interface SocketUser {
  id: string;
  nickname: string;
  avatar: number;
  loginCode: string;
  chatCode: string;
  status: SocketUserStatus;
  theme: SocketUserTheme;
}

export interface JoinPayload {
  nickname?: string;
  avatar?: number;
  loginCode?: string | null;
}

export type RoomType = 'private' | 'group';

export interface RoomParticipant {
  id: string;
  nickname: string;
  avatar: number;
  status: SocketUserStatus;
  chatCode: string;
  lastSeen: string;
}

export type MessageType = 'text' | 'system';

export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface MessageSender {
  id: string;
  nickname: string;
  avatar: number | null;
}

export interface MessageView {
  id: string;
  roomId: string;
  sender: MessageSender;
  content: string;
  type: MessageType;
  timestamp: string;
  deletedForEveryone: boolean;
  status: MessageStatus;
  deliveredTo: string[];
  readBy: string[];
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
  'user:registered': (payload: { user: SocketUser }) => void;
  'user:online': (payload: { userId: string; nickname: string; avatar: number }) => void;
  'user:offline': (payload: {
    userId: string;
    user: { id: string; status: SocketUserStatus; lastSeen: string };
  }) => void;
  'user:profile-updated': (payload: { userId: string; nickname: string; avatar: number }) => void;
  'user:profile-updated-success': (payload: { user: SocketUser }) => void;
  error: (payload: { message: string }) => void;
  'rooms:list': (payload: { rooms: RoomSummary[] }) => void;
  'room:created': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:joined': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:new': (payload: { room: RoomSummary; messages: MessageView[] }) => void;
  'room:deleted': (payload: { roomId: string }) => void;
  'group:left': (payload: { roomId: string }) => void;
  'group:user-left': (payload: { roomId: string; userId: string; userName: string; participants: RoomParticipant[] }) => void;
  'user:blocked': (payload: BlockStatusPayload) => void;
  'user:unblocked': (payload: BlockStatusPayload) => void;
  'message:new': (payload: MessageView) => void;
  'message:mark-read-done': (payload: { roomId: string; unreadCount: number }) => void;
  'message:read-receipt': (payload: { roomId: string; userId: string }) => void;
  'messages:list': (payload: { roomId: string; messages: MessageView[] }) => void;
  'typing:update': (payload: { roomId: string; users: string[] }) => void;
  'message:deleted': (payload: { messageId: string; roomId: string }) => void;
}

export interface ClientToServerEvents {
  'user:join': (payload: JoinPayload) => void;
  'user:update-profile': (payload: { nickname: string; avatar: number }) => void;
  'rooms:get': () => void;
  'room:create-private': (payload: { targetChatCode: string }) => void;
  'room:create-group': (payload: { roomName: string }) => void;
  'room:join-by-code': (payload: { roomCode: string }) => void;
  'room:delete': (payload: { roomId: string }) => void;
  'group:leave': (payload: { roomId: string }) => void;
  'user:block': (payload: { roomId: string; blockedUserId: string }) => void;
  'user:unblock': (payload: { roomId: string; blockedUserId: string }) => void;
  'message:send': (payload: { roomId: string; content: string }) => void;
  'message:mark-read': (payload: { roomId: string }) => void;
  'messages:get': (payload: { roomId: string }) => void;
  'typing:start': (payload: { roomId: string }) => void;
  'typing:stop': (payload: { roomId: string }) => void;
  'message:delete': (payload: { messageId: string }) => void;
}
