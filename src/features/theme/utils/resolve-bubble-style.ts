import type { ChatAppearance } from '../constants/chat-appearance';
import type { ThemePalette } from '../types';
import { getContrastTextColor } from './contrast-text-color';
import { hexToRgba, toSixDigitHex } from './hex-to-rgba';

export interface ResolvedBubbleStyle {
  background: string;
  textColor: string;
  blur: number;
}

export function resolveBubbleStyle(theme: ThemePalette, appearance: ChatAppearance, isOwn: boolean): ResolvedBubbleStyle {
  const customColor = isOwn ? appearance.ownBubbleColor : appearance.otherBubbleColor;
  const opacity = isOwn ? appearance.ownBubbleOpacity : appearance.otherBubbleOpacity;
  const baseColor = customColor ?? toSixDigitHex(isOwn ? theme.messageOwn : theme.messageOther);

  return {
    background: hexToRgba(baseColor, opacity),
    textColor: customColor ? getContrastTextColor(customColor) : isOwn ? theme.messageOwnText : theme.messageOtherText,
    blur: appearance.bubbleBlur,
  };
}
