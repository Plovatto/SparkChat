import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDecryptedMediaCache, markExpiredMediaUrl } from '@lib/e2ee/media-cache';
import type { ChatMessage } from '../types';
import { ImageMessageContent } from './ImageMessageContent';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#123456' }) }),
}));
vi.mock('@lib/e2ee', async () => ({ isExpiredMediaUrl: (await import('@lib/e2ee/media-cache')).isExpiredMediaUrl }));
vi.mock('./ImageModal', () => ({ ImageModal: () => null }));

const GIF_URL = 'https://cdn.test/uploads/gifs/a.bin?e2e=1';

function imageMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    roomId: 'r1',
    sender: { id: 'u2', nickname: 'Bob', avatar: null },
    content: GIF_URL,
    type: 'image',
    duration: null,
    timestamp: '2026-01-01T00:00:00.000Z',
    deletedForEveryone: false,
    status: 'sent',
    deliveredTo: [],
    readBy: [],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: { name: 'gif.webp', mimeType: 'image/webp; sparkchat-gif=1', size: 100, key: 'k' },
    caption: null,
    linkPreview: null,
    ...overrides,
  };
}

afterEach(() => {
  clearDecryptedMediaCache();
});

describe('ImageMessageContent with gifs', () => {
  it('shows an animated gif from its decrypted object url', () => {
    const html = renderToStaticMarkup(<ImageMessageContent message={imageMessage({ content: 'blob:https://app.test/gif' })} />);

    expect(html).toContain('data-testid="gif-message"');
    expect(html).toContain('src="blob:https://app.test/gif"');
    expect(html).toContain('alt="chat.message.sentGif"');
  });

  it('shows the expired block when the gif download was gone', () => {
    markExpiredMediaUrl(GIF_URL);

    const html = renderToStaticMarkup(<ImageMessageContent message={imageMessage()} />);

    expect(html).toContain('data-testid="gif-expired"');
    expect(html).toContain('chat.message.gifExpired');
    expect(html).not.toContain('<img');
  });

  it('keeps loading a gif that did not expire', () => {
    const html = renderToStaticMarkup(<ImageMessageContent message={imageMessage()} />);

    expect(html).not.toContain('gif-expired');
    expect(html).toContain('data-testid="gif-message"');
  });

  it('never shows the expired block for a regular image', () => {
    markExpiredMediaUrl(GIF_URL);

    const html = renderToStaticMarkup(
      <ImageMessageContent message={imageMessage({ fileMeta: { name: 'a.webp', mimeType: 'image/webp', size: 100, key: 'k' } })} />,
    );

    expect(html).not.toContain('gif-expired');
    expect(html).not.toContain('gif-message');
  });
});
