import { describe, expect, it, vi } from 'vitest';
import type { MessageView, RoomSummary } from '@lib/socket';
import { buildNotificationContent } from './build-notification-content';

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));
vi.mock('@lib/format', () => ({ systemMessageText: () => 'system' }));
const photos = vi.hoisted(() => new Map<string, string>());
const photoIcon = vi.hoisted(() => ({ result: null as string | null }));

vi.mock('./build-notification-icon', () => ({
  buildNotificationIcon: () => Promise.resolve('icon-url'),
  buildPhotoNotificationIcon: () => Promise.resolve(photoIcon.result),
}));
vi.mock('@features/profile-photos', () => ({ getUserPhotoUrl: (userId: string) => photos.get(userId) ?? null }));

function message(overrides: Partial<MessageView> = {}): MessageView {
  return {
    id: 'm1',
    roomId: 'r1',
    sender: { id: 'u2', nickname: 'Bob', avatar: null },
    content: 'the secret plan',
    type: 'text',
    duration: null,
    timestamp: '2026-01-01T00:00:00.000Z',
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

function room(overrides: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id: 'r1',
    type: 'private',
    participants: [],
    lastMessage: null,
    unreadCount: 0,
    mentionCount: 0,
    blockedBy: {},
    isBlockedBy: false,
    userBlocked: false,
    isMutuallyBlocked: false,
    ...overrides,
  };
}

describe('buildNotificationContent', () => {
  it('hides the message content by default', async () => {
    const content = await buildNotificationContent(message(), room({ type: 'group', name: 'Secret group' }));
    expect(content).toEqual({ title: 'Bob', body: 'notifications.newMessage', icon: 'icon-url' });
  });

  it('never attaches decrypted media when content is hidden', async () => {
    const content = await buildNotificationContent(message({ type: 'image', content: 'blob:https://app/decrypted' }), room(), { hideContent: true });
    expect(content.image).toBeUndefined();
    expect(JSON.stringify(content)).not.toContain('blob:');
  });

  it('shows the preview and the image when the user opts in', async () => {
    const text = await buildNotificationContent(message(), room(), { hideContent: false });
    expect(text).toEqual({ title: 'Bob', body: 'the secret plan', icon: 'icon-url' });

    const image = await buildNotificationContent(message({ type: 'image', content: 'blob:https://app/decrypted' }), room({ type: 'group', name: 'Team' }), {
      hideContent: false,
    });
    expect(image).toEqual({ title: 'Team', body: 'Bob: notifications.sentImage', icon: 'icon-url', image: 'blob:https://app/decrypted' });
  });

  it('says GIF for a marked gif and image for any other image', async () => {
    const gif = await buildNotificationContent(
      message({ type: 'image', content: 'blob:https://app/gif', fileMeta: { name: 'gif.webp', mimeType: 'image/webp; sparkchat-gif=1', size: 10 } }),
      room(),
      { hideContent: false },
    );
    expect(gif.body).toBe('notifications.sentGif');
    expect(gif.image).toBeUndefined();

    const plain = await buildNotificationContent(
      message({ type: 'image', content: 'blob:https://app/img', fileMeta: { name: 'a.webp', mimeType: 'image/webp', size: 10 } }),
      room(),
      { hideContent: false },
    );
    expect(plain.body).toBe('notifications.sentImage');
  });

  it('keeps a gif hidden when content is hidden', async () => {
    const gif = await buildNotificationContent(
      message({ type: 'image', content: 'blob:https://app/gif', fileMeta: { name: 'gif.webp', mimeType: 'image/webp; sparkchat-gif=1', size: 10 } }),
      room(),
    );
    expect(gif).toEqual({ title: 'Bob', body: 'notifications.newMessage', icon: 'icon-url' });
  });
});

describe('buildNotificationContent sender photo', () => {
  it('uses the decrypted profile photo of the sender when it is available', async () => {
    photos.set('u2', 'blob:https://app/photo-1');
    photoIcon.result = 'photo-icon';
    const content = await buildNotificationContent(message(), room());
    expect(content.icon).toBe('photo-icon');
    photos.clear();
  });

  it('falls back to the preset avatar when the photo cannot be drawn', async () => {
    photos.set('u2', 'blob:https://app/photo-2');
    photoIcon.result = null;
    const content = await buildNotificationContent(message(), room());
    expect(content.icon).toBe('icon-url');
    photos.clear();
  });

  it('never uses a photo for an unknown sender', async () => {
    photos.set('u2', 'blob:https://app/photo-3');
    photoIcon.result = 'photo-icon';
    const content = await buildNotificationContent(message({ sender: { id: 'u2', nickname: 'Bob', avatar: null, unknown: true } }), room());
    expect(content.icon).toBe('icon-url');
    photos.clear();
  });
});
