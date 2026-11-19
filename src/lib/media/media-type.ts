import type { MessageType } from '@lib/socket';

export const OPAQUE_MEDIA_TYPE = 'application/octet-stream';
export const PDF_MEDIA_TYPE = 'application/pdf';

const RASTER_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const AUDIO_TYPE_PATTERN = /^audio\/[a-z0-9][a-z0-9.+-]{0,63}$/;

function essenceOf(mimeType: string | null | undefined): string {
  return (mimeType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

function isAllowedFor(messageType: MessageType, essence: string): boolean {
  switch (messageType) {
    case 'image':
      return RASTER_IMAGE_TYPES.has(essence);
    case 'audio':
      return AUDIO_TYPE_PATTERN.test(essence);
    case 'file':
      return RASTER_IMAGE_TYPES.has(essence) || VIDEO_TYPES.has(essence) || essence === PDF_MEDIA_TYPE;
    default:
      return false;
  }
}

export function resolveSafeMediaType(messageType: MessageType, mimeType: string | null | undefined): string {
  const essence = essenceOf(mimeType);
  return isAllowedFor(messageType, essence) ? essence : OPAQUE_MEDIA_TYPE;
}
