export interface ThemeBase {
  id: string;
  name: string;
  background: string;
  surface: string;
  surfaceLight: string;
  text: string;
  textSecondary: string;
  border: string;
  inputBg: string;
  sidebarBg: string;
}

export const THEME_BASES = {
  dark: {
    id: 'dark',
    name: 'Modo Escuro',
    background: '#36393f',
    surface: '#2f3136',
    surfaceLight: '#40444b',
    text: '#f0f0f0',
    textSecondary: '#b0b0b0',
    border: '#202225',
    inputBg: '#40444b',
    sidebarBg: '#2f3136',
  },
  light: {
    id: 'light',
    name: 'Modo Claro',
    background: '#ffffff',
    surface: '#f5f5f5',
    surfaceLight: '#ededed',
    text: '#2e3338',
    textSecondary: '#4e5058',
    border: '#d0d0d0',
    inputBg: '#ffffff',
    sidebarBg: '#f5f5f5',
  },
  midnight: {
    id: 'midnight',
    name: 'Meia-Noite',
    background: '#0a0a0a',
    surface: '#1a1a1a',
    surfaceLight: '#2d2d2d',
    text: '#f5f5f5',
    textSecondary: '#a0a0a0',
    border: '#333333',
    inputBg: '#2d2d2d',
    sidebarBg: '#1a1a1a',
  },
} as const satisfies Record<string, ThemeBase>;

export type ThemeBaseId = keyof typeof THEME_BASES;
