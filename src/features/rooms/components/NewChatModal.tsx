import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import type { IconType } from 'react-icons';
import { FaArrowRight, FaExclamationTriangle, FaUser, FaUsers } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { Modal } from '@components/common/Modal';
import { Spinner } from '@components/common/Spinner';
import { useTheme, withAlpha } from '@features/theme';
import { useAutoDismiss } from '@hooks/useAutoDismiss';
import { translateErrorPayload } from '@lib/api/api-error';
import { useOnLanguageChange } from '@lib/i18n/app-i18n';
import { useSocket, type SocketErrorPayload } from '@lib/socket';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ChatType = 'private' | 'group';
type GroupMode = 'join' | 'create';

const ROOM_CODE_MIN_LENGTH = 6;
const GROUP_NAME_MIN_LENGTH = 3;

function OrDivider() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <div style={{ textAlign: 'center', position: 'relative', margin: '8px 0' }}>
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: theme.border }} />
      <span
        style={{
          background: theme.surfaceElevated,
          padding: '0 15px',
          color: theme.textMuted,
          fontSize: '0.85rem',
          fontWeight: 600,
          position: 'relative',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {t('newChat.or')}
      </span>
    </div>
  );
}

export function NewChatModal({ isOpen, onClose }: NewChatModalProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { socket } = useSocket();
  const [chatType, setChatType] = useState<ChatType>('private');
  const [targetNickname, setTargetNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');
  useOnLanguageChange(() => setError(''));
  useAutoDismiss(error, setError);
  const [groupMode, setGroupMode] = useState<GroupMode>('join');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setChatType('private');
      setTargetNickname('');
      setRoomCode('');
      setGroupName('');
      setError('');
      setGroupMode('join');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!socket || !isOpen) {
      return;
    }

    const handleError = (payload: SocketErrorPayload) => {
      setIsSubmitting(false);
      setError(translateErrorPayload(payload, 'errors.generic'));
    };
    const handleRoomOpened = () => onClose();

    socket.on('error', handleError);
    socket.on('room:created', handleRoomOpened);
    socket.on('room:joined', handleRoomOpened);

    return () => {
      socket.off('error', handleError);
      socket.off('room:created', handleRoomOpened);
      socket.off('room:joined', handleRoomOpened);
    };
  }, [socket, isOpen, onClose]);

  const handleStartPrivateChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    if (!targetNickname.trim()) {
      setError(t('newChat.enterUsername'));
      return;
    }
    setIsSubmitting(true);
    socket?.emit('room:create-private', { targetNickname: targetNickname.trim() });
    setError('');
  };

  const handleJoinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    if (roomCode.trim().length < ROOM_CODE_MIN_LENGTH) {
      setError(t('newChat.invalidCode'));
      return;
    }
    setIsSubmitting(true);
    socket?.emit('room:join-by-code', { roomCode: roomCode.toUpperCase() });
    setError('');
  };

  const handleCreateGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    if (groupName.trim().length < GROUP_NAME_MIN_LENGTH) {
      setError(t('newChat.nameTooShort', { minLength: GROUP_NAME_MIN_LENGTH }));
      return;
    }
    setIsSubmitting(true);
    socket?.emit('room:create-group', { roomName: groupName.trim() });
    setError('');
  };

  const labelStyle: CSSProperties = {
    fontWeight: 600,
    display: 'block',
    marginBottom: '10px',
    color: theme.textPrimary,
    fontSize: '0.95rem',
  };

  const helperStyle: CSSProperties = {
    color: theme.textSecondary,
    marginTop: '6px',
    display: 'block',
  };

  const fullWidthButton: CSSProperties = { width: '100%', padding: '12px 20px' };

  const submitIcon = isSubmitting ? (
    <Spinner size={14} trackColor={withAlpha(theme.textOnAccent, 0.35)} accentColor={theme.textOnAccent} />
  ) : (
    <FaArrowRight size={14} />
  );

  const renderTab = (type: ChatType, Icon: IconType, label: string) => {
    const isActive = chatType === type;

    return (
      <button
        onClick={() => {
          setChatType(type);
          setError('');
        }}
        data-active={isActive}
        className="sc-tab"
        style={{
          flex: 1,
          padding: '12px 16px',
          fontSize: '0.95rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          borderRadius: '8px 8px 0 0',
        }}
      >
        <Icon size={16} />
        {label}
      </button>
    );
  };

  return (
    <Modal isOpen={isOpen} title={t('newChat.title')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', marginBottom: '16px', borderBottom: `2px solid ${theme.border}` }}>
          {renderTab('private', FaUser, t('newChat.private'))}
          {renderTab('group', FaUsers, t('common.group'))}
        </div>

        {error && (
          <div key={error} className="sc-notice sc-notice--danger sc-anim-shake" style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            <FaExclamationTriangle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {chatType === 'private' && (
          <form
            className="sc-anim-rise-in"
            onSubmit={handleStartPrivateChat}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div>
              <label style={labelStyle}>{t('newChat.friendUsername')}</label>
              <input
                type="text"
                value={targetNickname}
                onChange={(event) => {
                  setTargetNickname(event.target.value);
                  setError('');
                }}
                placeholder={t('newChat.friendPlaceholder')}
                maxLength={20}
                autoFocus
                className="sc-input"
              />
              <small style={helperStyle}>{t('newChat.friendHelp')}</small>
            </div>
            <button type="submit" disabled={isSubmitting} className="sc-btn sc-btn--primary sc-btn--lift" style={fullWidthButton}>
              {submitIcon}
              {isSubmitting ? t('newChat.starting') : t('newChat.start')}
            </button>
          </form>
        )}

        {chatType === 'group' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              className={groupMode === 'join' ? 'sc-anim-swap-in-left' : undefined}
              style={{ display: groupMode === 'join' ? 'flex' : 'none', flexDirection: 'column', gap: '16px' }}
            >
              <form onSubmit={handleJoinRoom} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>{t('newChat.joinExisting')}</label>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(event) => {
                      setRoomCode(event.target.value.toUpperCase());
                      setError('');
                    }}
                    placeholder={t('newChat.codePlaceholder')}
                    maxLength={8}
                    autoFocus={groupMode === 'join'}
                    className="sc-input"
                  />
                  <small style={helperStyle}>{t('newChat.codeHelp')}</small>
                </div>
                <button type="submit" disabled={isSubmitting} className="sc-btn sc-btn--primary sc-btn--lift" style={fullWidthButton}>
                  {submitIcon}
                  {isSubmitting ? t('newChat.joining') : t('newChat.join')}
                </button>
              </form>

              <OrDivider />

              <button
                onClick={() => {
                  setGroupMode('create');
                  setRoomCode('');
                  setError('');
                }}
                className="sc-btn sc-btn--outline sc-btn--lift"
                style={fullWidthButton}
              >
                {t('newChat.createNew')}
              </button>
            </div>

            <div
              className={groupMode === 'create' ? 'sc-anim-swap-in-right' : undefined}
              style={{ display: groupMode === 'create' ? 'flex' : 'none', flexDirection: 'column', gap: '16px' }}
            >
              <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>{t('newChat.createNew')}</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(event) => {
                      setGroupName(event.target.value);
                      setError('');
                    }}
                    placeholder={t('newChat.namePlaceholder')}
                    maxLength={30}
                    autoFocus={groupMode === 'create'}
                    className="sc-input"
                  />
                  <small style={helperStyle}>{t('newChat.nameHelp')}</small>
                </div>
                <button type="submit" disabled={isSubmitting} className="sc-btn sc-btn--primary sc-btn--lift" style={fullWidthButton}>
                  {submitIcon}
                  {isSubmitting ? t('newChat.creating') : t('newChat.create')}
                </button>
              </form>

              <OrDivider />

              <button
                onClick={() => {
                  setGroupMode('join');
                  setGroupName('');
                  setError('');
                }}
                className="sc-btn sc-btn--outline sc-btn--lift"
                style={fullWidthButton}
              >
                {t('newChat.joinExisting')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
