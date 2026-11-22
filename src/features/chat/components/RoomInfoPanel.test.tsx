import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomSummary } from '@lib/socket';

const emit = vi.fn();
const attestGroupAction = vi.fn(() => Promise.resolve(null));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@lib/socket', () => ({ useSocket: () => ({ socket: { emit } }) }));
vi.mock('@lib/e2ee', () => ({ attestGroupAction, downloadMessageMedia: vi.fn() }));
vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));
vi.mock('@lib/format', () => ({ formatTimeAgo: () => '' }));
vi.mock('@hooks/useClipboardCopy', () => ({ useClipboardCopy: () => ({ copy: vi.fn(), isCopied: () => false }) }));
vi.mock('@features/calls', () => ({ useOptionalCall: () => null }));
vi.mock('@features/rooms', () => ({ getOtherParticipant: () => undefined, getRoomDisplayName: (target: RoomSummary) => target.name }));
vi.mock('@features/profile-photos/components/Avatar', () => ({ Avatar: () => <span /> }));
vi.mock('@features/profile-photos/components/GroupPhotoEditor', () => ({ GroupPhotoEditor: () => <span /> }));
vi.mock('@features/profile-photos/components/ProfilePhotoViewer', () => ({ ProfilePhotoViewer: () => null }));
vi.mock('@components/common/Switch', () => ({ Switch: () => <span /> }));
vi.mock('@components/common/SideDrawer', () => ({
  SideDrawer: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));
vi.mock('@components/common/ConfirmDialog', () => ({
  ConfirmDialog: ({ isOpen, title, confirmLabel, onConfirm, onCancel }: { isOpen: boolean; title: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onCancel();
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel}>
          cancel
        </button>
      </div>
    ) : null,
}));
vi.mock('./ChatAppearanceView', () => ({ ChatAppearanceActions: () => null, ChatAppearanceView: () => null }));
vi.mock('./ContactSecurityLink', () => ({ ContactSecurityLink: () => null }));
vi.mock('./GroupInviteSection', () => ({ GroupInviteSection: () => null }));
vi.mock('./GroupNameEditor', () => ({ GroupNameEditor: () => null }));
vi.mock('./PdfPreviewModal', () => ({ PdfPreviewModal: () => null }));
vi.mock('./media-viewer/MediaViewer', () => ({ MediaViewer: () => null }));
vi.mock('./media-viewer/media-viewer-context', () => ({ useMediaViewer: () => null }));
vi.mock('./room-info/InfoMediaGrid', () => ({ InfoMediaGrid: () => null }));
vi.mock('./room-info/InfoMessageSearch', () => ({ InfoMessageSearch: () => null }));
vi.mock('./room-info/MemberRow', () => ({ MemberRow: () => null }));
vi.mock('../styles/room-info-drawer.css', () => ({}));

const { RoomInfoPanel } = await import('./RoomInfoPanel');

const room = {
  id: 'g1',
  type: 'group',
  name: 'Amigos',
  participants: [
    { id: 'me', nickname: 'eu', avatar: 1, isAdmin: true, status: 'online' },
    { id: 'u2', nickname: 'bia', avatar: 2, isAdmin: false, status: 'online' },
  ],
} as unknown as RoomSummary;

function renderPanel(onLeftGroup = vi.fn()) {
  render(
    <RoomInfoPanel isOpen onClose={vi.fn()} room={room} currentUserId="me" messages={[]} messagesLoaded onLeftGroup={onLeftGroup} />,
  );
  return onLeftGroup;
}

afterEach(() => {
  emit.mockClear();
  attestGroupAction.mockClear();
});

describe('RoomInfoPanel leave group', () => {
  it('asks for confirmation and stays in the group when the user cancels', () => {
    const onLeftGroup = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'roomInfo.leave' }));

    expect(screen.getByRole('dialog', { name: 'roomInfo.leaveTitle' })).toBeTruthy();
    expect(attestGroupAction).not.toHaveBeenCalled();
    expect(onLeftGroup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onLeftGroup).not.toHaveBeenCalled();
  });

  it('leaves the group only after the user confirms', async () => {
    const onLeftGroup = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'roomInfo.leave' }));
    fireEvent.click(screen.getByRole('button', { name: 'roomInfo.leaveConfirmAction' }));

    expect(onLeftGroup).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith('group:leave', { roomId: 'g1' }));
  });
});
