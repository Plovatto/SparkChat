import type { IconType } from 'react-icons';
import type { AuthMethod, SocketUserStatus, SocketUserTheme } from '@lib/socket';

export type LoginMode = 'choose' | 'new' | 'existing';

export interface User {
  id: string;
  nickname: string;
  avatar: number;
  sessionToken: string;
  authMethod?: AuthMethod;
  status?: SocketUserStatus;
  statusText?: string | null;
  theme?: SocketUserTheme;
}

export interface PendingRegistration {
  nickname: string;
  avatar: number;
  password: string;
}

export interface LoginCredentials {
  nickname: string;
  password: string;
}

export type PendingE2eCredential =
  | { type: 'password'; password: string }
  | { type: 'keyfile'; recoveryToken: string };

export interface Avatar {
  icon: IconType;
  name: string;
  color: string;
  bgGradient: string;
}
