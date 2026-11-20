import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { MessageType } from '@lib/socket';
import { buildGifMimeType, isGifMimeType, OPAQUE_MEDIA_TYPE, resolveSafeMediaType, sniffGifMediaType } from './media-type';

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

  it('keeps only the raster essence of a marked gif type', () => {
    expect(resolveSafeMediaType('image', 'image/webp; sparkchat-gif=1')).toBe('image/webp');
    expect(resolveSafeMediaType('image', 'image/gif;sparkchat-gif=1')).toBe('image/gif');
    expect(resolveSafeMediaType('image', 'image/svg+xml; sparkchat-gif=1')).toBe(OPAQUE_MEDIA_TYPE);
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

describe('isGifMimeType', () => {
  it('recognizes the gif marker built for webp and gif media', () => {
    expect(buildGifMimeType('image/webp')).toBe('image/webp; sparkchat-gif=1');
    expect(isGifMimeType(buildGifMimeType('image/webp'))).toBe(true);
    expect(isGifMimeType(buildGifMimeType('image/gif'))).toBe(true);
    expect(isGifMimeType('IMAGE/WEBP;SPARKCHAT-GIF=1')).toBe(true);
  });

  it('rejects unmarked, wrongly marked or non gif media', () => {
    expect(isGifMimeType('image/webp')).toBe(false);
    expect(isGifMimeType('image/gif')).toBe(false);
    expect(isGifMimeType('image/webp; sparkchat-gif=0')).toBe(false);
    expect(isGifMimeType('image/png; sparkchat-gif=1')).toBe(false);
    expect(isGifMimeType('text/html; sparkchat-gif=1')).toBe(false);
    expect(isGifMimeType(null)).toBe(false);
    expect(isGifMimeType(undefined)).toBe(false);
  });
});

describe('sniffGifMediaType', () => {
  const encode = (text: string) => new TextEncoder().encode(text);

  it('detects webp and gif signatures', () => {
    expect(sniffGifMediaType(encode('RIFF____WEBPVP8 '))).toBe('image/webp');
    expect(sniffGifMediaType(encode('GIF89a......'))).toBe('image/gif');
    expect(sniffGifMediaType(encode('GIF87a......'))).toBe('image/gif');
  });

  it('rejects anything else', () => {
    expect(sniffGifMediaType(encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffGifMediaType(encode('RIFF____WAVE'))).toBeNull();
    expect(sniffGifMediaType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(sniffGifMediaType(new Uint8Array())).toBeNull();
  });
});
