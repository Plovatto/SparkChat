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

export const GIF_MEDIA_TYPES = ['image/webp', 'image/gif'] as const;
export type GifMediaType = (typeof GIF_MEDIA_TYPES)[number];

const GIF_MARKER_PARAMETER = 'sparkchat-gif';

export function isGifMediaType(value: string): value is GifMediaType {
  return (GIF_MEDIA_TYPES as readonly string[]).includes(value);
}

export function buildGifMimeType(essence: GifMediaType): string {
  return `${essence}; ${GIF_MARKER_PARAMETER}=1`;
}

const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50];
const GIF_SIGNATURES = [
  [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
  [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
];

function startsWithAt(bytes: Uint8Array, signature: number[], offset: number): boolean {
  return bytes.byteLength >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);
}

export function sniffGifMediaType(bytes: Uint8Array): GifMediaType | null {
  if (startsWithAt(bytes, WEBP_RIFF, 0) && startsWithAt(bytes, WEBP_TAG, 8)) {
    return 'image/webp';
  }
  return GIF_SIGNATURES.some((signature) => startsWithAt(bytes, signature, 0)) ? 'image/gif' : null;
}

export function isGifMimeType(mimeType: string | null | undefined): boolean {
  const [essence = '', ...parameters] = (mimeType ?? '').split(';');
  if (!isGifMediaType(essence.trim().toLowerCase())) {
    return false;
  }
  return parameters.some((parameter) => {
    const [name = '', value = ''] = parameter.split('=');
    return name.trim().toLowerCase() === GIF_MARKER_PARAMETER && value.trim() === '1';
  });
}

export function resolveSafeMediaType(messageType: MessageType, mimeType: string | null | undefined): string {
  const essence = essenceOf(mimeType);
  return isAllowedFor(messageType, essence) ? essence : OPAQUE_MEDIA_TYPE;
}
