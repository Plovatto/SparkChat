import { describe, expect, it } from 'vitest';
import { CHAT_ATTACHMENT_MAX_WIDTH, CHAT_GIF_MAX_WIDTH, fitAttachmentHeight } from './chat-attachment-layout';

describe('fitAttachmentHeight', () => {
  it('keeps images and videos at the attachment width', () => {
    expect(fitAttachmentHeight(400, 400)).toBe(CHAT_ATTACHMENT_MAX_WIDTH);
  });

  it('sizes gifs like animated stickers, smaller than images', () => {
    expect(CHAT_GIF_MAX_WIDTH).toBeLessThan(CHAT_ATTACHMENT_MAX_WIDTH);
    expect(fitAttachmentHeight(220, 220, CHAT_GIF_MAX_WIDTH)).toBe(CHAT_GIF_MAX_WIDTH);
    expect(fitAttachmentHeight(220, 110, CHAT_GIF_MAX_WIDTH)).toBe(Math.round(CHAT_GIF_MAX_WIDTH / 1.5));
  });
});
