export interface ChatAppearance {
  overlayOpacity: number;
  overlayBlur: number;
  ownBubbleColor: string | null;
  ownBubbleOpacity: number;
  otherBubbleColor: string | null;
  otherBubbleOpacity: number;
  bubbleBlur: number;
}

export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = {
  overlayOpacity: 32,
  overlayBlur: 0,
  ownBubbleColor: null,
  ownBubbleOpacity: 90,
  otherBubbleColor: null,
  otherBubbleOpacity: 90,
  bubbleBlur: 0,
};
