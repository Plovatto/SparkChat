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
