import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MessageView } from '@lib/socket';
import { ReplyPreviewBar } from './ReplyPreviewBar';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));

vi.mock('../hooks/useReplyVideoThumbnail', () => ({
  useReplyVideoThumbnail: () => null,
}));

function buildMessage(overrides: Partial<MessageView> = {}): MessageView {
  return {
    id: 'm1',
    roomId: 'r1',
    sender: { id: 'u2', nickname: 'abruno', avatar: null },
    content: 'Check-in dia 20 a partir das 14h.',
    type: 'text',
    duration: null,
    timestamp: '2026-11-20T10:00:00.000Z',
    deletedForEveryone: false,
    status: 'sent',
    deliveredTo: [],
    readBy: [],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: null,
    caption: null,
    linkPreview: null,
    ...overrides,
  };
}

describe('ReplyPreviewBar', () => {
  it('shows the sender name and the replied text', () => {
    render(<ReplyPreviewBar message={buildMessage()} currentUserId="u1" onCancel={() => undefined} />);

    expect(screen.getByText('chat.message.replyingTo:{"name":"abruno"}')).toBeTruthy();
    expect(screen.getByText('Check-in dia 20 a partir das 14h.')).toBeTruthy();
  });

  it('uses the self label when replying to own message', () => {
    render(<ReplyPreviewBar message={buildMessage({ sender: { id: 'u1', nickname: 'me', avatar: null } })} currentUserId="u1" onCancel={() => undefined} />);

    expect(screen.getByText('chat.message.replyingToSelf')).toBeTruthy();
  });

  it('calls onCancel from the labelled close button', () => {
    const onCancel = vi.fn();
    render(<ReplyPreviewBar message={buildMessage()} currentUserId="u1" onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'chat.message.cancelReply' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('applies the exiting class driven by the parent presence', () => {
    render(<ReplyPreviewBar message={buildMessage()} currentUserId="u1" isExiting onCancel={() => undefined} />);

    expect(screen.getByTestId('reply-preview-bar').className).toContain('is-exiting');
  });

  it('keeps the audio duration preview', () => {
    render(<ReplyPreviewBar message={buildMessage({ type: 'audio', duration: 12, content: '' })} currentUserId="u1" onCancel={() => undefined} />);

    expect(screen.getByText(/chat\.message\.audio/)).toBeTruthy();
  });
});
