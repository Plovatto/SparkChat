import { clampAspectRatio } from './clamp-aspect-ratio';

export const CHAT_ATTACHMENT_MAX_WIDTH = 300;
export const CHAT_GIF_MAX_WIDTH = 180;

const CHAT_ATTACHMENT_MIN_RATIO = 0.75;
const CHAT_ATTACHMENT_MAX_RATIO = 1.5;

export function fitAttachmentHeight(width: number, height: number, maxWidth: number = CHAT_ATTACHMENT_MAX_WIDTH): number {
  return Math.round(maxWidth / clampAspectRatio(width, height, CHAT_ATTACHMENT_MIN_RATIO, CHAT_ATTACHMENT_MAX_RATIO));
}
