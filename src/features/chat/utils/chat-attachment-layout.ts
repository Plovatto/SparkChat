import { clampAspectRatio } from './clamp-aspect-ratio';

export const CHAT_ATTACHMENT_MAX_WIDTH = 260;

const CHAT_ATTACHMENT_MIN_RATIO = 1.1;
const CHAT_ATTACHMENT_MAX_RATIO = 1.91;

export function fitAttachmentHeight(width: number, height: number): number {
  return Math.round(CHAT_ATTACHMENT_MAX_WIDTH / clampAspectRatio(width, height, CHAT_ATTACHMENT_MIN_RATIO, CHAT_ATTACHMENT_MAX_RATIO));
}
