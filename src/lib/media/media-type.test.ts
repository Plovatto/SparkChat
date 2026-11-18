import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { MessageType } from '@lib/socket';
import { OPAQUE_MEDIA_TYPE, resolveSafeMediaType } from './media-type';

const ACTIVE_TYPES = ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml', 'application/xml', 'text/javascript', 'multipart/x-mixed-replace'];

describe('resolveSafeMediaType', () => {
  it('keeps only raster images for image messages', () => {
    expect(resolveSafeMediaType('image', 'image/jpeg')).toBe('image/jpeg');
    expect(resolveSafeMediaType('image', 'IMAGE/PNG')).toBe('image/png');
    expect(resolveSafeMediaType('image', 'image/gif')).toBe('image/gif');
    expect(resolveSafeMediaType('image', 'image/webp')).toBe('image/webp');
    expect(resolveSafeMediaType('image', 'image/svg+xml')).toBe(OPAQUE_MEDIA_TYPE);
    expect(resolveSafeMediaType('image', 'application/pdf')).toBe(OPAQUE_MEDIA_TYPE);
  });

  it('keeps audio types for audio messages without their parameters', () => {
    expect(resolveSafeMediaType('audio', 'audio/webm;codecs=opus')).toBe('audio/webm');
    expect(resolveSafeMediaType('audio', 'audio/mpeg')).toBe('audio/mpeg');
    expect(resolveSafeMediaType('audio', 'video/mp4')).toBe(OPAQUE_MEDIA_TYPE);
  });

  it('keeps passive video, raster image and pdf types for file messages', () => {
    expect(resolveSafeMediaType('file', 'video/mp4')).toBe('video/mp4');
    expect(resolveSafeMediaType('file', 'video/webm')).toBe('video/webm');
    expect(resolveSafeMediaType('file', 'video/quicktime')).toBe('video/quicktime');
    expect(resolveSafeMediaType('file', 'application/pdf')).toBe('application/pdf');
    expect(resolveSafeMediaType('file', 'image/png')).toBe('image/png');
    expect(resolveSafeMediaType('file', 'application/zip')).toBe(OPAQUE_MEDIA_TYPE);
    expect(resolveSafeMediaType('file', null)).toBe(OPAQUE_MEDIA_TYPE);
  });

  it('never returns a document or script type for any message type', () => {
    const messageTypes: MessageType[] = ['text', 'system', 'image', 'audio', 'file', 'error'];
    fc.assert(
      fc.property(fc.constantFrom(...messageTypes), fc.oneof(fc.constantFrom(...ACTIVE_TYPES), fc.string()), (messageType, mimeType) => {
        const resolved = resolveSafeMediaType(messageType, mimeType);
        expect(ACTIVE_TYPES).not.toContain(resolved);
        expect(resolved === OPAQUE_MEDIA_TYPE || /^(image\/(jpeg|png|gif|webp)|audio\/[a-z0-9.+-]+|video\/(mp4|webm|quicktime)|application\/pdf)$/.test(resolved)).toBe(true);
      }),
    );
  });
});
