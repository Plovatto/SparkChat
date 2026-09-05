import type { ChatAppearance } from '../constants/chat-appearance';
import type { ThemeTokens } from '../types';
import { isLight, withAlpha } from './color';
import { getContrastTextColor } from './contrast-text-color';
import { hexToRgba, toSixDigitHex } from './hex-to-rgba';

export interface ResolvedBubbleStyle {
  background: string;
  textColor: string;
  mutedTextColor: string;
  innerBackground: string;
  innerStrongBackground: string;
  accentColor: string;
  blur: number;
}

function intensityToGray(intensity: number): string {
  const clamped = Math.max(0, Math.min(100, intensity));
  const value = Math.round(255 * (1 - clamped / 100));
  const hex = value.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

export function resolveBubbleStyle(theme: ThemeTokens, appearance: ChatAppearance, isOwn: boolean): ResolvedBubbleStyle {
  const customColor = isOwn ? appearance.ownBubbleColor : appearance.otherBubbleColor;
  const opacity = isOwn ? appearance.ownBubbleOpacity : appearance.otherBubbleOpacity;
  const baseColor = customColor ?? toSixDigitHex(isOwn ? theme.messageOwn : theme.messageOther);
  const textIntensity = isOwn ? appearance.ownTextIntensity : appearance.otherTextIntensity;
  const isCustomized = customColor !== null || textIntensity !== null;

  const textColor =
    textIntensity !== null
      ? intensityToGray(textIntensity)
      : customColor
        ? getContrastTextColor(customColor)
        : isOwn
          ? theme.messageOwnText
          : theme.messageOtherText;

  if (!isCustomized) {
    return {
      background: hexToRgba(baseColor, opacity),
      textColor,
      mutedTextColor: isOwn ? theme.messageOwnMuted : theme.messageOtherMuted,
      innerBackground: isOwn ? theme.messageOwnInner : theme.messageOtherInner,
      innerStrongBackground: isOwn ? theme.messageOwnInnerStrong : theme.messageOtherInnerStrong,
      accentColor: isOwn ? theme.messageOwnAccent : theme.messageOtherAccent,
      blur: appearance.bubbleBlur,
    };
  }

  const textIsLight = isLight(textColor);
  const innerBase = textIsLight ? '#ffffff' : '#000000';

  return {
    background: hexToRgba(baseColor, opacity),
    textColor,
    mutedTextColor: withAlpha(textColor, 0.76),
    innerBackground: withAlpha(innerBase, textIsLight ? 0.16 : 0.07),
    innerStrongBackground: withAlpha(innerBase, textIsLight ? 0.28 : 0.13),
    accentColor: textColor,
    blur: appearance.bubbleBlur,
  };
}
