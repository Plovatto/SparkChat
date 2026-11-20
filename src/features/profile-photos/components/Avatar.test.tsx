import { renderToStaticMarkup } from 'react-dom/server';
import { FaUsers } from 'react-icons/fa';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATARS } from '@features/auth/constants/avatars';

const photos = vi.hoisted(() => ({ user: new Map<string, string>(), room: new Map<string, string>() }));

vi.mock('../index', () => ({
  useUserPhoto: (userId: string | null | undefined) => (userId ? (photos.user.get(userId) ?? null) : null),
  useRoomPhoto: (roomId: string | null | undefined) => (roomId ? (photos.room.get(roomId) ?? null) : null),
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({
    theme: { gradientControl: 'GRADIENT_CONTROL', accentSoft: 'ACCENT_SOFT', accentText: 'ACCENT_TEXT', accent: 'ACCENT' },
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./profile-photos.css', () => ({}));

const { Avatar } = await import('./Avatar');

beforeEach(() => {
  photos.user.clear();
  photos.room.clear();
});

describe('Avatar', () => {
  it('renders the preset gradient and icon when there is no photo', () => {
    const html = renderToStaticMarkup(<Avatar userId="u1" avatarIndex={2} size={48} iconSize={22} />);
    expect(html).toContain(AVATARS[2]?.bgGradient);
    expect(html).toContain('<svg');
    expect(html).not.toContain('<img');
    expect(html).toContain('width:48px');
  });

  it('falls back to the control gradient without a preset', () => {
    const html = renderToStaticMarkup(<Avatar userId="u1" size={40} iconSize={20} />);
    expect(html).toContain('GRADIENT_CONTROL');
    expect(html).not.toContain('<svg');
  });

  it('supports the soft and solid tones', () => {
    expect(renderToStaticMarkup(<Avatar avatarIndex={1} tone="soft" size={42} iconSize={20} />)).toContain('ACCENT_SOFT');
    expect(renderToStaticMarkup(<Avatar avatarIndex={1} tone="solid" size={16} iconSize={10} />)).toContain(AVATARS[1]?.color);
  });

  it('shows the user photo over the fallback when it exists', () => {
    photos.user.set('u1', 'blob:photo-u1');
    const html = renderToStaticMarkup(<Avatar userId="u1" avatarIndex={0} size={48} iconSize={22} />);
    expect(html).toContain('src="blob:photo-u1"');
    expect(html).toContain('class="sc-avatar-photo"');
    expect(html).toContain('data-has-photo="true"');
  });

  it('uses the room photo when a room id is given and ignores the user photo', () => {
    photos.user.set('u1', 'blob:user');
    photos.room.set('r1', 'blob:room');
    const html = renderToStaticMarkup(<Avatar roomId="r1" userId="u1" icon={FaUsers} size={90} iconSize={45} />);
    expect(html).toContain('blob:room');
    expect(html).not.toContain('blob:user');
  });

  it('becomes a view button only when a photo exists and a handler is provided', () => {
    const onPhotoClick = vi.fn();
    expect(renderToStaticMarkup(<Avatar userId="u1" size={42} iconSize={20} onPhotoClick={onPhotoClick} />)).not.toContain('<button');

    photos.user.set('u1', 'blob:photo');
    const html = renderToStaticMarkup(<Avatar userId="u1" size={42} iconSize={20} onPhotoClick={onPhotoClick} />);
    expect(html).toContain('<button');
    expect(html).toContain('aria-label="profilePhotos.view"');
  });

  it('keeps overlay children such as the online dot', () => {
    const html = renderToStaticMarkup(
      <Avatar userId="u1" size={42} iconSize={20}>
        <span data-testid="online" />
      </Avatar>,
    );
    expect(html).toContain('data-testid="online"');
  });
});
