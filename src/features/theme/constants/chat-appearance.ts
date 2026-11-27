export interface ChatAppearance {
  overlayOpacity: number;
  overlayBlur: number;
  ownBubbleColor: string | null;
  ownBubbleOpacity: number;
  ownTextIntensity: number | null;
  otherBubbleColor: string | null;
  otherBubbleOpacity: number;
  otherTextIntensity: number | null;
  bubbleBlur: number;
}

export interface ChatSettings {
  roomWallpapers: Record<string, string>;
  globalWallpaper: string | null;
  roomAppearance: Record<string, ChatAppearance>;
  globalAppearance: ChatAppearance | null;
}

export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = {
  overlayOpacity: 32,
  overlayBlur: 0,
  ownBubbleColor: null,
  ownBubbleOpacity: 90,
  ownTextIntensity: null,
  otherBubbleColor: null,
  otherBubbleOpacity: 90,
  otherTextIntensity: null,
  bubbleBlur: 0,
};

export const APPEARANCE_RANGES = {
  overlayOpacity: [0, 100],
  overlayBlur: [0, 20],
  ownBubbleOpacity: [10, 100],
  ownTextIntensity: [0, 100],
  otherBubbleOpacity: [10, 100],
  otherTextIntensity: [0, 100],
  bubbleBlur: [0, 20],
} as const;

export function blurToPercent(value: number, field: 'overlayBlur' | 'bubbleBlur'): number {
  const [min, max] = APPEARANCE_RANGES[field];
  return Math.round(((value - min) / (max - min)) * 100);
}

export function hasWallpaperOverlay(isImage: boolean, appearance: Pick<ChatAppearance, 'overlayOpacity' | 'overlayBlur'>): boolean {
  return isImage && (appearance.overlayOpacity > 0 || appearance.overlayBlur > 0);
}
