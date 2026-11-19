import { useEffect, useState, type FormEvent } from 'react';
import { FaCheck, FaPen, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { getRoomDisplayName } from '@features/rooms';
import { useTheme } from '@features/theme';
import { translateErrorPayload } from '@lib/api/api-error';
import { renameGroup } from '@lib/e2ee';
import { useSocket, type RoomSummary, type SocketErrorPayload } from '@lib/socket';

const GROUP_NAME_MAX_LENGTH = 64;

interface GroupNameEditorProps {
  room: RoomSummary;
  currentUserId: string | undefined;
}

export function GroupNameEditor({ room, currentUserId }: GroupNameEditorProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { socket } = useSocket();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!socket || !isEditing) {
      return;
    }
    const handleError = (payload: SocketErrorPayload) => {
      if (payload.event === 'room:rename') {
        setIsSaving(false);
        setError(translateErrorPayload(payload, 'errors.generic'));
      }
    };
    socket.on('error', handleError);
    return () => {
      socket.off('error', handleError);
    };
  }, [socket, isEditing]);

  useEffect(() => {
    if (isSaving && room.name === draft.trim()) {
      setIsSaving(false);
      setIsEditing(false);
    }
  }, [isSaving, room.name, draft]);

  const startEditing = () => {
    setDraft(room.name ?? '');
    setError('');
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.trim();
    if (!socket || isSaving || name.length === 0) {
      return;
    }
    if (name === room.name) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    setError('');
    renameGroup(socket, room.id, name)
      .then((sent) => {
        if (!sent) {
          setIsSaving(false);
          setError(t('errors.generic'));
        }
      })
      .catch(() => {
        setIsSaving(false);
        setError(t('errors.e2ee.encryptFailed'));
      });
  };

  if (!isEditing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '0 0 10px 0' }}>
        <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, color: theme.textPrimary }}>{getRoomDisplayName(room, currentUserId)}</h3>
        {room.name && (
          <button
            type="button"
            onClick={startEditing}
            aria-label={t('roomInfo.rename')}
            title={t('roomInfo.rename')}
            style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', padding: '4px' }}
          >
            <FaPen size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '0 0 10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={GROUP_NAME_MAX_LENGTH}
          aria-label={t('roomInfo.renameLabel')}
          autoFocus
          className="sc-input"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="submit" disabled={isSaving || draft.trim().length === 0} aria-label={t('roomInfo.renameSave')} className="sc-btn" style={{ padding: '8px' }}>
          <FaCheck size={14} />
        </button>
        <button type="button" onClick={() => setIsEditing(false)} aria-label={t('roomInfo.renameCancel')} className="sc-btn" style={{ padding: '8px' }}>
          <FaTimes size={14} />
        </button>
      </div>
      {error && (
        <span role="alert" style={{ color: theme.dangerText, fontSize: '0.85rem' }}>
          {error}
        </span>
      )}
    </form>
  );
}
