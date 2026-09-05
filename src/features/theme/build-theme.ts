import { COLOR_THEMES, type ColorThemeId, type ModeRecipe, type NeutralOverrides } from './constants/color-themes';
import { THEME_BASES, type NeutralLadder, type ThemeBase, type ThemeBaseId } from './constants/theme-bases';
import type { ThemeTokens } from './types';
import { contrastRatio, ensureContrast, hslToHex, isLight, mix, pickReadableText, shiftLightness, toHsl, withAlpha } from './utils/color';

export interface BuiltTheme {
  id: string;
  baseId: ThemeBaseId;
  colorId: ColorThemeId;
  tokens: ThemeTokens;
}

type NeutralKey = keyof NeutralLadder;

const MIDNIGHT_SHIFT = -7;
const WHITE = '#ffffff';
const READABLE_TEXT_MIN = 3;
const BODY_TEXT_MIN = 4.5;
const MUTED_TEXT_MIN = 3.2;
const ELEVATION_MIN_GAP = 4;
const STATE_MIN_GAP = 3;
const HOVER_FALLBACK_SHIFT = 7;
const PRESSED_FALLBACK_SHIFT = 12;

const ACCENT_TEXT_SATURATION_FACTOR = 1.3;
const ICON_MUTED_SATURATION_FACTOR = 1.5;

function desaturate(color: string, factor: number): string {
  const { h, s, l } = toHsl(color);
  return hslToHex(h, s * factor, l);
}

function neutralFromLadder(base: ThemeBase, hue: number, strength: number, key: NeutralKey): string {
  const lightness = base.ladder[key];
  const isTextKey = key === 'textPrimary' || key === 'textSecondary' || key === 'textMuted' || key === 'textDisabled' || key === 'placeholder';
  const saturation = (isTextKey ? base.textSaturation : base.surfaceSaturation) * strength;
  return hslToHex(hue, saturation, lightness);
}

function resolveOverride(value: string | undefined, baseId: ThemeBaseId, deepen: boolean): string | undefined {
  if (!value) {
    return undefined;
  }
  if (baseId !== 'midnight' || !deepen) {
    return value;
  }
  const { h, s, l } = toHsl(value);
  return hslToHex(h, s, Math.max(l + MIDNIGHT_SHIFT, l * 0.55));
}

interface Neutrals {
  sidebar: string;
  canvas: string;
  surfaceSunken: string;
  surface: string;
  surfaceElevated: string;
  input: string;
  inputFocus: string;
  borderSubtle: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  placeholder: string;
  skeleton: string;
  messageOther: string;
  offline: string;
}

function buildNeutrals(base: ThemeBase, baseId: ThemeBaseId, recipe: ModeRecipe): Neutrals {
  const { h } = toHsl(recipe.tint);
  const strength = recipe.tintStrength ?? 1;
  const overrides: NeutralOverrides = recipe.neutrals ?? {};
  const surfaceKeys = new Set<keyof NeutralOverrides>(['sidebar', 'canvas', 'surface', 'surfaceElevated', 'surfaceSunken', 'input', 'border', 'borderStrong']);

  const pick = (key: NeutralKey): string => {
    const overrideKey = key as keyof NeutralOverrides;
    const override = resolveOverride(overrides[overrideKey], baseId, surfaceKeys.has(overrideKey));
    return override ?? neutralFromLadder(base, h, strength, key);
  };

  const isDark = base.kind === 'dark';
  const textDirection = isDark ? 'lighter' : 'darker';
  const input = pick('input');
  const surface = pick('surface');
  const sidebar = pick('sidebar');
  const rawElevated = pick('surfaceElevated');
  const elevationGap = toHsl(rawElevated).l - toHsl(surface).l;
  const surfaceElevated = isDark && elevationGap < ELEVATION_MIN_GAP ? shiftLightness(rawElevated, ELEVATION_MIN_GAP - elevationGap) : rawElevated;
  const textSecondary = ensureContrast(ensureContrast(pick('textSecondary'), surface, BODY_TEXT_MIN, textDirection), sidebar, BODY_TEXT_MIN, textDirection);
  const textMuted = ensureContrast(pick('textMuted'), surface, MUTED_TEXT_MIN, textDirection);
  const placeholder = ensureContrast(pick('placeholder'), input, MUTED_TEXT_MIN, textDirection);

  return {
    sidebar,
    canvas: pick('canvas'),
    surfaceSunken: pick('surfaceSunken'),
    surface,
    surfaceElevated,
    input,
    inputFocus: overrides.input ? shiftLightness(input, isDark ? 3 : 2) : pick('inputFocus'),
    borderSubtle: pick('borderSubtle'),
    border: pick('border'),
    borderStrong: pick('borderStrong'),
    textPrimary: pick('textPrimary'),
    textSecondary,
    textMuted,
    textDisabled: pick('textDisabled'),
    placeholder,
    skeleton: pick('skeleton'),
    messageOther: pick('messageOther'),
    offline: pick('offline'),
  };
}

function resolveAccentState(accent: string, candidate: string, textOnAccent: string, direction: 'lighter' | 'darker', fallbackShift: number): string {
  const readable = ensureContrast(candidate, textOnAccent, READABLE_TEXT_MIN, direction);
  if (Math.abs(toHsl(readable).l - toHsl(accent).l) >= STATE_MIN_GAP) {
    return readable;
  }
  const { h, s, l } = toHsl(accent);
  return hslToHex(h, Math.min(100, s + 6), direction === 'darker' ? l - fallbackShift : l + fallbackShift);
}

function buildGradientVariant(recipe: ModeRecipe, stop: string, secondaryMix: number): string {
  return `linear-gradient(135deg, ${stop} 0%, ${mix(recipe.accentSecondary, stop, secondaryMix)} 100%)`;
}

function resolveOnGradient(recipe: ModeRecipe, graphite: string): string {
  if (recipe.onGradient) {
    return recipe.onGradient;
  }
  const worst = Math.min(contrastRatio(WHITE, recipe.accent), contrastRatio(WHITE, recipe.accentSecondary));
  return worst >= 2.6 ? WHITE : graphite;
}

export function buildTheme(baseId: ThemeBaseId, colorId: ColorThemeId): BuiltTheme {
  const base = THEME_BASES[baseId];
  const color = COLOR_THEMES[colorId];
  const recipe: ModeRecipe = base.kind === 'light' ? color.light : color.dark;
  const isDark = base.kind === 'dark';
  const graphite = base.graphite;
  const n = buildNeutrals(base, baseId, recipe);

  const textDirection = isDark ? 'lighter' : 'darker';
  const accent = recipe.accent;
  const textOnAccent = recipe.onAccent ?? pickReadableText(accent, WHITE, graphite, READABLE_TEXT_MIN);
  const onAccentIsLight = textOnAccent === WHITE || isLight(textOnAccent);
  const accentStateDirection = onAccentIsLight ? 'darker' : 'lighter';
  const accentHover = resolveAccentState(accent, recipe.accentHover, textOnAccent, accentStateDirection, HOVER_FALLBACK_SHIFT);
  const accentPressed = resolveAccentState(accent, recipe.accentPressed, textOnAccent, accentStateDirection, PRESSED_FALLBACK_SHIFT);
  const accentIsLight = isLight(accent);

  const surfaceMix = (amount: number) => mix(n.surface, accent, amount);
  const surfaceHover = isDark ? mix(shiftLightness(n.surface, 2), accent, 0.05) : surfaceMix(0.05);
  const surfacePressed = isDark ? mix(shiftLightness(n.surface, 6), accent, 0.14) : surfaceMix(0.16);
  const surfaceSelected = isDark ? mix(shiftLightness(n.surface, 3), accent, 0.12) : surfaceMix(0.1);
  const surfaceSelectedHover = isDark ? mix(shiftLightness(n.surface, 5), accent, 0.17) : surfaceMix(0.15);

  const accentText = [n.surface, n.sidebar, surfaceSelectedHover].reduce(
    (candidate, background) => ensureContrast(candidate, background, BODY_TEXT_MIN, textDirection),
    desaturate(accent, ACCENT_TEXT_SATURATION_FACTOR),
  );

  const iconMuted = ensureContrast(desaturate(accent, ICON_MUTED_SATURATION_FACTOR), n.input, READABLE_TEXT_MIN, textDirection);

  const gradient = recipe.gradient ?? `linear-gradient(135deg, ${accent} 0%, ${recipe.accentSecondary} 100%)`;
  const onGradient = resolveOnGradient(recipe, graphite);
  const gradientIsLightText = onGradient === WHITE || isLight(onGradient);
  const controlBase = gradientIsLightText ? WHITE : '#000000';

  const messageOwnText = recipe.bubble ? pickReadableText(recipe.bubble, WHITE, graphite, READABLE_TEXT_MIN) : textOnAccent;
  const ownTextIsLight = messageOwnText === WHITE || isLight(messageOwnText);
  const messageOwn = ensureContrast(recipe.bubble ?? accent, messageOwnText, READABLE_TEXT_MIN, ownTextIsLight ? 'darker' : 'lighter');
  const ownInnerBase = ownTextIsLight ? WHITE : '#000000';
  const messageSystem = isDark ? mix(n.surfaceElevated, accent, 0.22) : mix(n.surface, accent, 0.14);
  const link = accentText;

  const tokens: ThemeTokens = {
    kind: base.kind,

    canvas: n.canvas,
    sidebar: n.sidebar,
    surface: n.surface,
    surfaceElevated: n.surfaceElevated,
    surfaceSunken: n.surfaceSunken,
    surfaceHover,
    surfacePressed,
    surfaceSelected,
    surfaceSelectedHover,

    input: n.input,
    inputHover: isDark ? shiftLightness(n.input, 6) : mix(n.input, accent, 0.03),
    inputFocus: n.inputFocus,
    inputDisabled: n.surfaceSunken,
    placeholder: n.placeholder,

    border: n.border,
    borderSubtle: n.borderSubtle,
    borderStrong: n.borderStrong,
    borderHover: mix(n.borderStrong, accent, 0.45),
    borderFocus: accent,
    focusRing: withAlpha(accent, isDark ? 0.42 : 0.3),

    textPrimary: n.textPrimary,
    textSecondary: n.textSecondary,
    textMuted: n.textMuted,
    textDisabled: n.textDisabled,
    textOnAccent,
    link,
    linkHover: shiftLightness(link, isDark ? 8 : -8),
    selection: withAlpha(accent, isDark ? 0.4 : 0.28),

    accent,
    accentHover,
    accentPressed,
    accentText,
    iconMuted,
    accentSoft: withAlpha(accent, isDark ? 0.16 : 0.12),
    accentSoftHover: withAlpha(accent, isDark ? 0.24 : 0.19),
    accentSoftPressed: withAlpha(accent, isDark ? 0.32 : 0.27),
    accentSecondary: recipe.accentSecondary,

    gradient,
    gradientHover: recipe.gradient ? gradient : buildGradientVariant(recipe, accentHover, 0.18),
    gradientPressed: recipe.gradient ? gradient : buildGradientVariant(recipe, accentPressed, 0.3),
    onGradient,
    onGradientMuted: withAlpha(onGradient, 0.78),
    gradientControl: withAlpha(controlBase, gradientIsLightText ? 0.18 : 0.1),
    gradientControlHover: withAlpha(controlBase, gradientIsLightText ? 0.3 : 0.17),
    gradientControlPressed: withAlpha(controlBase, gradientIsLightText ? 0.4 : 0.24),
    gradientInput: withAlpha(controlBase, gradientIsLightText ? 0.16 : 0.08),

    messageOwn,
    messageOwnText,
    messageOwnMuted: withAlpha(messageOwnText, 0.76),
    messageOwnInner: withAlpha(ownInnerBase, ownTextIsLight ? 0.16 : 0.08),
    messageOwnInnerStrong: withAlpha(ownInnerBase, ownTextIsLight ? 0.28 : 0.14),
    messageOwnAccent: messageOwnText,
    messageOther: n.messageOther,
    messageOtherText: n.textPrimary,
    messageOtherMuted: n.textSecondary,
    messageOtherInner: withAlpha(isDark ? WHITE : '#000000', isDark ? 0.08 : 0.05),
    messageOtherInnerStrong: withAlpha(isDark ? WHITE : '#000000', isDark ? 0.16 : 0.09),
    messageOtherAccent: accentText,
    messageSystem,
    messageSystemText: ensureContrast(accentText, messageSystem, BODY_TEXT_MIN, textDirection),
    messageSelectedRing: withAlpha(accentIsLight && isDark ? WHITE : accent, 0.55),
    messageHighlight: base.status.warning,

    success: base.status.success,
    successSoft: base.status.successSoft,
    successText: base.status.successText,
    warning: base.status.warning,
    warningHover: base.status.warningHover,
    warningPressed: base.status.warningPressed,
    warningSoft: base.status.warningSoft,
    warningText: base.status.warningText,
    onWarning: base.status.onWarning,
    danger: base.status.danger,
    dangerHover: base.status.dangerHover,
    dangerPressed: base.status.dangerPressed,
    dangerSoft: base.status.dangerSoft,
    dangerSoftHover: base.status.dangerSoftHover,
    dangerText: base.status.dangerText,
    infoSoft: withAlpha(accent, isDark ? 0.14 : 0.1),
    infoText: accentText,
    online: base.status.online,
    offline: n.offline,
    audioFresh: base.status.audioFresh,
    audioPlayed: base.status.audioPlayed,
    receiptRead: base.status.receiptRead,

    overlay: base.overlay,
    overlayStrong: base.overlayStrong,
    scrim: base.scrim,
    onScrim: WHITE,
    scrimControl: 'rgba(255, 255, 255, 0.14)',
    scrimControlHover: 'rgba(255, 255, 255, 0.26)',
    scrimControlPressed: 'rgba(255, 255, 255, 0.36)',
    shadowSm: base.shadowSm,
    shadowMd: base.shadowMd,
    shadowLg: base.shadowLg,
    shadowAccent: `0 4px 14px ${withAlpha(accent, isDark ? 0.32 : 0.3)}`,
    shadowAccentHover: `0 8px 22px ${withAlpha(accent, isDark ? 0.42 : 0.4)}`,
    scrollbarThumb: withAlpha(accent, 0.75),
    scrollbarThumbHover: withAlpha(accent, 1),
    skeleton: n.skeleton,
    skeletonHighlight: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.75)',
    dateChip: base.dateChip,
    dateChipText: base.dateChipText,
    ripple: base.ripple,

    ...recipe.overrides,
  };

  return { id: `${baseId}-${colorId}`, baseId, colorId, tokens };
}
