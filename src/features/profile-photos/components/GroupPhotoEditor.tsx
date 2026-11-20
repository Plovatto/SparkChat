import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCamera, FaTimes, FaUsers } from 'react-icons/fa';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { Spinner } from '@components/common/Spinner';
import { useCanRenameGroup } from '@features/chat/hooks/useCanRenameGroup';
import { useTheme } from '@features/theme';
import { useAutoDismiss } from '@hooks/useAutoDismiss';
import type { RoomSummary } from '@lib/socket';
import { removeRoomPhoto, uploadRoomPhoto, useRoomPhoto } from '../index';
import { usePhotoPicker } from '../hooks/usePhotoPicker';
import { Avatar } from './Avatar';
import './profile-photos.css';

interface GroupPhotoEditorProps {
  room: RoomSummary;
  size: number;
  iconSize: number;
  avatarStyle: CSSProperties;
  onView: (photoUrl: string) => void;
  onConfirmChange?: (isOpen: boolean) => void;
}

type PendingOperation = 'upload' | 'remove' | null;

export function GroupPhotoEditor({ room, size, iconSize, avatarStyle, onView, onConfirmChange }: GroupPhotoEditorProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const roomId = room.id;
  const canEdit = useCanRenameGroup(room);
  const photo = useRoomPhoto(roomId);
  const [operation, setOperation] = useState<PendingOperation>(null);
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);
  const [error, setError] = useState('');
  useAutoDismiss(error, setError);

  const run = (next: Exclude<PendingOperation, null>, action: () => Promise<void>) => {
    setOperation(next);
    setError('');
    action()
      .catch(() => setError(t(next === 'upload' ? 'profilePhotos.errors.uploadFailed' : 'profilePhotos.errors.removeFailed')))
      .finally(() => setOperation(null));
  };

  const picker = usePhotoPicker((blob) => run('upload', () => uploadRoomPhoto(roomId, blob)));
  const isBusy = operation !== null || picker.isPreparing;
  const badgeSize = Math.max(30, Math.round(size * 0.34));
  const message = error || picker.error;

  const setConfirming = (isOpen: boolean) => {
    setIsConfirmingRemoval(isOpen);
    onConfirmChange?.(isOpen);
  };

  return (
    <>
      <div style={{ position: 'relative', width: `${size}px`, height: `${size}px`, margin: '0 auto 15px' }}>
        <Avatar
          roomId={roomId}
          icon={FaUsers}
          tone="soft"
          size={size}
          iconSize={iconSize}
          style={{ ...avatarStyle, margin: 0 }}
          viewLabel={t('profilePhotos.group.view')}
          onPhotoClick={onView}
        >
          {isBusy && (
            <span className="sc-photo-edit-overlay" aria-hidden="true">
              <Spinner size={Math.round(size * 0.3)} trackColor="rgba(255, 255, 255, 0.3)" accentColor="#ffffff" />
            </span>
          )}
        </Avatar>

        {canEdit && (
          <button
            type="button"
            className="sc-photo-badge sc-anim-pop-in"
            onClick={picker.open}
            disabled={isBusy}
            title={t('profilePhotos.group.change')}
            aria-label={t('profilePhotos.group.change')}
            style={{ width: `${badgeSize}px`, height: `${badgeSize}px`, right: '-2px', bottom: '-2px', borderWidth: '3px' }}
          >
            <FaCamera size={Math.round(badgeSize * 0.42)} />
          </button>
        )}

        {canEdit && photo && (
          <button
            type="button"
            className="sc-photo-badge sc-photo-badge--remove"
            onClick={() => setConfirming(true)}
            disabled={isBusy}
            title={t('profilePhotos.group.remove')}
            aria-label={t('profilePhotos.group.remove')}
            style={{ width: '28px', height: '28px', top: '0px', right: '0px' }}
          >
            <FaTimes size={12} />
          </button>
        )}
      </div>

      {message && (
        <small key={message} role="alert" className="sc-anim-shake" style={{ display: 'block', margin: '-6px 0 12px', color: theme.dangerText, fontWeight: 600 }}>
          {message}
        </small>
      )}

      {picker.element}

      <ConfirmDialog
        isOpen={isConfirmingRemoval}
        title={t('profilePhotos.group.removeTitle')}
        message={t('profilePhotos.group.removeConfirm')}
        confirmLabel={t('profilePhotos.remove')}
        onConfirm={() => run('remove', () => removeRoomPhoto(roomId))}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
