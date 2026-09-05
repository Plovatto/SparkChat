import type { ThemeKind } from '../types';

export interface NeutralLadder {
  sidebar: number;
  canvas: number;
  surfaceSunken: number;
  surface: number;
  surfaceElevated: number;
  input: number;
  inputFocus: number;
  borderSubtle: number;
  border: number;
  borderStrong: number;
  textPrimary: number;
  textSecondary: number;
  textMuted: number;
  textDisabled: number;
  placeholder: number;
  skeleton: number;
  messageOther: number;
  offline: number;
}

export interface StatusPalette {
  success: string;
  successSoft: string;
  successText: string;
  warning: string;
  warningHover: string;
  warningPressed: string;
  warningSoft: string;
  warningText: string;
  onWarning: string;
  danger: string;
  dangerHover: string;
  dangerPressed: string;
  dangerSoft: string;
  dangerSoftHover: string;
  dangerText: string;
  online: string;
  audioFresh: string;
  audioPlayed: string;
  receiptRead: string;
}

export interface ThemeBase {
  id: string;
  name: string;
  kind: ThemeKind;
  ladder: NeutralLadder;
  surfaceSaturation: number;
  textSaturation: number;
  status: StatusPalette;
  overlay: string;
  overlayStrong: string;
  scrim: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  dateChip: string;
  dateChipText: string;
  ripple: string;
  graphite: string;
}

const LIGHT_STATUS: StatusPalette = {
  success: '#16a34a',
  successSoft: 'rgba(22, 163, 74, 0.12)',
  successText: '#15803d',
  warning: '#f59e0b',
  warningHover: '#e08c07',
  warningPressed: '#c27605',
  warningSoft: 'rgba(245, 158, 11, 0.14)',
  warningText: '#b45309',
  onWarning: '#2a1d05',
  danger: '#e53e3e',
  dangerHover: '#d32f2f',
  dangerPressed: '#b32424',
  dangerSoft: 'rgba(229, 62, 62, 0.10)',
  dangerSoftHover: 'rgba(229, 62, 62, 0.18)',
  dangerText: '#c62828',
  online: '#22c55e',
  audioFresh: '#22c55e',
  audioPlayed: '#0ea5e9',
  receiptRead: '#38bdf8',
};

const DARK_STATUS: StatusPalette = {
  success: '#22c55e',
  successSoft: 'rgba(34, 197, 94, 0.16)',
  successText: '#4ade80',
  warning: '#fbbf24',
  warningHover: '#fcd34d',
  warningPressed: '#f0ab0f',
  warningSoft: 'rgba(251, 191, 36, 0.16)',
  warningText: '#fbbf24',
  onWarning: '#2a1d05',
  danger: '#ef4444',
  dangerHover: '#f25c5c',
  dangerPressed: '#d32f2f',
  dangerSoft: 'rgba(239, 68, 68, 0.16)',
  dangerSoftHover: 'rgba(239, 68, 68, 0.26)',
  dangerText: '#f87171',
  online: '#22c55e',
  audioFresh: '#34d399',
  audioPlayed: '#38bdf8',
  receiptRead: '#38bdf8',
};

export const THEME_BASES = {
  dark: {
    id: 'dark',
    name: 'Modo Escuro',
    kind: 'dark',
    ladder: {
      sidebar: 15,
      canvas: 15,
      surfaceSunken: 18.5,
      surface: 18.5,
      surfaceElevated: 23,
      input: 26,
      inputFocus: 30,
      borderSubtle: 22,
      border: 27,
      borderStrong: 36,
      textPrimary: 96,
      textSecondary: 74,
      textMuted: 56,
      textDisabled: 42,
      placeholder: 52,
      skeleton: 24,
      messageOther: 23,
      offline: 48,
    },
    surfaceSaturation: 15,
    textSaturation: 10,
    status: DARK_STATUS,
    overlay: 'rgba(3, 5, 10, 0.66)',
    overlayStrong: 'rgba(3, 5, 10, 0.82)',
    scrim: 'rgba(0, 0, 0, 0.55)',
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.35)',
    shadowMd: '0 8px 24px rgba(0, 0, 0, 0.42)',
    shadowLg: '0 24px 70px rgba(0, 0, 0, 0.6)',
    dateChip: 'rgba(8, 10, 16, 0.66)',
    dateChipText: '#f4f5f8',
    ripple: 'rgba(255, 255, 255, 0.22)',
    graphite: '#14171e',
  },
  light: {
    id: 'light',
    name: 'Modo Claro',
    kind: 'light',
    ladder: {
      sidebar: 96.5,
      canvas: 96.5,
      surfaceSunken: 94,
      surface: 94,
      surfaceElevated: 100,
      input: 89,
      inputFocus: 93,
      borderSubtle: 89,
      border: 83,
      borderStrong: 76,
      textPrimary: 13,
      textSecondary: 38,
      textMuted: 55,
      textDisabled: 70,
      placeholder: 58,
      skeleton: 90,
      messageOther: 100,
      offline: 62,
    },
    surfaceSaturation: 5,
    textSaturation: 22,
    status: LIGHT_STATUS,
    overlay: 'rgba(16, 20, 34, 0.48)',
    overlayStrong: 'rgba(16, 20, 34, 0.72)',
    scrim: 'rgba(0, 0, 0, 0.55)',
    shadowSm: '0 1px 4px rgba(20, 24, 40, 0.10)',
    shadowMd: '0 8px 24px rgba(20, 24, 40, 0.14)',
    shadowLg: '0 24px 70px rgba(20, 24, 40, 0.24)',
    dateChip: 'rgba(255, 255, 255, 0.9)',
    dateChipText: '#3a3f4c',
    ripple: 'rgba(0, 0, 0, 0.08)',
    graphite: '#14171e',
  },
  midnight: {
    id: 'midnight',
    name: 'Meia-Noite',
    kind: 'dark',
    ladder: {
      sidebar: 6.5,
      canvas: 6.5,
      surfaceSunken: 9.5,
      surface: 9.5,
      surfaceElevated: 14,
      input: 12,
      inputFocus: 15,
      borderSubtle: 13,
      border: 18,
      borderStrong: 27,
      textPrimary: 96,
      textSecondary: 72,
      textMuted: 54,
      textDisabled: 40,
      placeholder: 50,
      skeleton: 15,
      messageOther: 14,
      offline: 46,
    },
    surfaceSaturation: 10,
    textSaturation: 8,
    status: DARK_STATUS,
    overlay: 'rgba(0, 0, 0, 0.72)',
    overlayStrong: 'rgba(0, 0, 0, 0.86)',
    scrim: 'rgba(0, 0, 0, 0.6)',
    shadowSm: '0 2px 8px rgba(0, 0, 0, 0.5)',
    shadowMd: '0 8px 24px rgba(0, 0, 0, 0.6)',
    shadowLg: '0 24px 70px rgba(0, 0, 0, 0.75)',
    dateChip: 'rgba(0, 0, 0, 0.7)',
    dateChipText: '#f4f5f8',
    ripple: 'rgba(255, 255, 255, 0.2)',
    graphite: '#0f1116',
  },
} as const satisfies Record<string, ThemeBase>;

export type ThemeBaseId = keyof typeof THEME_BASES;
