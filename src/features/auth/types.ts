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

export interface LoginThemePalette {
  background: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  bg: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  avatarGridBg: string;
  avatarBorder: string;
  buttonOutlineBg: string;
  buttonOutlineBorder: string;
  buttonOutlineText: string;
  alertBg: string;
  alertText: string;
  infoBg: string;
  infoBorder: string;
  infoText: string;
}
