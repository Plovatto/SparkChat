import type { ChatAppearance } from '../constants/chat-appearance';
import type { ThemePalette } from '../types';
import { getContrastTextColor } from './contrast-text-color';
import { hexToRgba, toSixDigitHex } from './hex-to-rgba';

export interface ResolvedBubbleStyle {
  background: string;
  textColor: string;
  blur: number;
}

function intensityToGray(intensity: number): string {
  const clamped = Math.max(0, Math.min(100, intensity));
  const value = Math.round(255 * (1 - clamped / 100));
  const hex = value.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

export function resolveBubbleStyle(theme: ThemePalette, appearance: ChatAppearance, isOwn: boolean): ResolvedBubbleStyle {
  const customColor = isOwn ? appearance.ownBubbleColor : appearance.otherBubbleColor;
  const opacity = isOwn ? appearance.ownBubbleOpacity : appearance.otherBubbleOpacity;
  const baseColor = customColor ?? toSixDigitHex(isOwn ? theme.messageOwn : theme.messageOther);
  const textIntensity = isOwn ? appearance.ownTextIntensity : appearance.otherTextIntensity;

  const textColor =
    textIntensity !== null
      ? intensityToGray(textIntensity)
      : customColor
        ? getContrastTextColor(customColor)
        : isOwn
          ? theme.messageOwnText
          : theme.messageOtherText;

  return {
    background: hexToRgba(baseColor, opacity),
    textColor,
    blur: appearance.bubbleBlur,
  };
}
