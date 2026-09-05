export type ThemeKind = 'light' | 'dark';

export interface ThemeTokens {
  kind: ThemeKind;

  canvas: string;
  sidebar: string;
  surface: string;
  surfaceElevated: string;
  surfaceSunken: string;
  surfaceHover: string;
  surfacePressed: string;
  surfaceSelected: string;
  surfaceSelectedHover: string;

  input: string;
  inputHover: string;
  inputFocus: string;
  inputDisabled: string;
  placeholder: string;

  border: string;
  borderSubtle: string;
  borderStrong: string;
  borderHover: string;
  borderFocus: string;
  focusRing: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  textOnAccent: string;
  link: string;
  linkHover: string;
  selection: string;

  accent: string;
  accentHover: string;
  accentPressed: string;
  accentText: string;
  iconMuted: string;
  accentSoft: string;
  accentSoftHover: string;
  accentSoftPressed: string;
  accentSecondary: string;

  gradient: string;
  gradientHover: string;
  gradientPressed: string;
  onGradient: string;
  onGradientMuted: string;
  gradientControl: string;
  gradientControlHover: string;
  gradientControlPressed: string;
  gradientInput: string;

  messageOwn: string;
  messageOwnText: string;
  messageOwnMuted: string;
  messageOwnInner: string;
  messageOwnInnerStrong: string;
  messageOwnAccent: string;
  messageOther: string;
  messageOtherText: string;
  messageOtherMuted: string;
  messageOtherInner: string;
  messageOtherInnerStrong: string;
  messageOtherAccent: string;
  messageSystem: string;
  messageSystemText: string;
  messageSelectedRing: string;
  messageHighlight: string;

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
  infoSoft: string;
  infoText: string;
  online: string;
  offline: string;
  audioFresh: string;
  audioPlayed: string;
  receiptRead: string;

  overlay: string;
  overlayStrong: string;
  scrim: string;
  onScrim: string;
  scrimControl: string;
  scrimControlHover: string;
  scrimControlPressed: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  shadowAccent: string;
  shadowAccentHover: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
  skeleton: string;
  skeletonHighlight: string;
  dateChip: string;
  dateChipText: string;
  ripple: string;
}

export type ThemePalette = ThemeTokens;
