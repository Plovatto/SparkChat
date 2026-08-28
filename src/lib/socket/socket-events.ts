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

export interface ServerToClientEvents {
  'user:registered': (payload: { user: SocketUser }) => void;
  'user:online': (payload: { userId: string; nickname: string; avatar: number }) => void;
  'user:offline': (payload: {
    userId: string;
    user: { id: string; status: SocketUserStatus; lastSeen: string };
  }) => void;
  error: (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  'user:join': (payload: JoinPayload) => void;
}
