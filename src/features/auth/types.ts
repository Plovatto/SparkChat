import type { IconType } from 'react-icons';

export type LoginMode = 'choose' | 'new' | 'existing';

export interface AuthUserTheme {
  baseTheme: string;
  colorTheme: string;
}

export interface User {
  nickname: string;
  avatar: number;
  id?: string;
  loginCode?: string | null;
  chatCode?: string;
  status?: 'online' | 'offline';
  theme?: AuthUserTheme;
}

export interface CreateAccountInput {
  nickname: string;
  avatar: number;
}

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
