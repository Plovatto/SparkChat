import type { IconType } from 'react-icons';
import type { RegistrationCredentials } from '@lib/e2ee';
import type { AuthMethod, SocketChatSettings, SocketUserStatus, SocketUserTheme } from '@lib/socket';

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
  chatSettings?: SocketChatSettings | null;
}

export interface PendingRegistration {
  nickname: string;
  avatar: number;
  credentials: RegistrationCredentials;
  photo?: Blob;
}

export interface LoginCredentials {
  nickname: string;
  password: string;
}

export type PendingE2eCredential =
  | { type: 'password-v2'; wrapKey: Uint8Array }
  | { type: 'recovery-v2'; recoveryWrapKey: Uint8Array };

export interface Avatar {
  icon: IconType;
  name: string;
  color: string;
  bgGradient: string;
}
