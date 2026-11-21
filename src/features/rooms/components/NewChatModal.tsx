import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LuArrowRight, LuLink, LuLock, LuMessageSquare, LuTriangleAlert, LuUser, LuUsers, LuX } from 'react-icons/lu';
import { Modal } from '@components/common/Modal';
import { Spinner } from '@components/common/Spinner';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { useTheme, withAlpha } from '@features/theme';
import { useAutoDismiss } from '@hooks/useAutoDismiss';
import { translateErrorPayload } from '@lib/api/api-error';
import { useOnLanguageChange } from '@lib/i18n/app-i18n';
import { useSocket, type RoomSummary, type SocketErrorPayload } from '@lib/socket';
import { recentContacts } from '../utils/recent-contacts';
import '../styles/new-chat-modal.css';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  rooms?: readonly RoomSummary[];
  currentUserId?: string;
}

type ChatType = 'private' | 'group';

const GROUP_NAME_MIN_LENGTH = 3;
const NICKNAME_MAX_LENGTH = 20;
const GROUP_NAME_MAX_LENGTH = 30;

function stagger(index: number): CSSProperties {
  return { '--sc-newchat-i': index } as CSSProperties;
}

export function NewChatModal({ isOpen, onClose, rooms = [], currentUserId }: NewChatModalProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { socket } = useSocket();
  const [chatType, setChatType] = useState<ChatType>('private');
  const [targetNickname, setTargetNickname] = useState('');
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');
  useOnLanguageChange(() => setError(''));
  useAutoDismiss(error, setError);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const recent = useMemo(() => recentContacts(rooms, currentUserId), [rooms, currentUserId]);

  useEffect(() => {
    if (!isOpen) {
      setChatType('private');
      setTargetNickname('');
      setGroupName('');
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!socket || !isOpen) {
      return;
    }

    const handleError = (payload: SocketErrorPayload) => {
      if (payload.clientTempId || payload.event) {
        return;
      }
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
    const nickname = targetNickname.trim().replace(/^@/, '');
    if (!nickname) {
      setError(t('newChat.enterUsername'));
      return;
    }
    setIsSubmitting(true);
    socket?.emit('room:create-private', { targetNickname: nickname });
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

  const selectType = (type: ChatType) => {
    setChatType(type);
    setError('');
  };

  const submitIcon = isSubmitting ? (
    <Spinner size={15} trackColor={withAlpha(theme.onGradient, 0.35)} accentColor={theme.onGradient} />
  ) : (
    <LuArrowRight size={17} className="sc-newchat-submit__arrow" aria-hidden="true" />
  );

  const segment = (type: ChatType, icon: ReactNode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={chatType === type}
      data-active={chatType === type}
      className="sc-newchat-segment__option"
      onClick={() => selectType(type)}
    >
      {icon}
      {label}
    </button>
  );

  const header = (
    <div className="sc-newchat-header">
      <span className="sc-newchat-header__icon" aria-hidden="true">
        <LuMessageSquare size={18} />
      </span>
      <div className="sc-newchat-header__text">
        <h2 className="sc-newchat-header__title">{t('newChat.title')}</h2>
        <p className="sc-newchat-header__subtitle">{t('newChat.subtitle')}</p>
      </div>
      <button type="button" onClick={onClose} title={t('common.close')} aria-label={t('common.close')} className="sc-icon-btn sc-icon-btn--header sc-newchat-header__close">
        <LuX size={18} />
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      header={header}
      maxWidth="440px"
      panelClassName="sc-newchat-panel"
      bodyStyle={{ padding: 0, scrollbarGutter: 'auto' }}
    >
      <div className="sc-newchat">
        <div className="sc-newchat-segment sc-newchat-enter" role="tablist" data-value={chatType} style={stagger(0)}>
          <span className="sc-newchat-segment__thumb" aria-hidden="true" />
          {segment('private', <LuUser size={16} aria-hidden="true" />, t('newChat.private'))}
          {segment('group', <LuUsers size={16} aria-hidden="true" />, t('common.group'))}
        </div>

        {error && (
          <div key={error} role="alert" className="sc-notice sc-notice--danger sc-anim-shake sc-newchat-error">
            <LuTriangleAlert size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {chatType === 'private' ? (
          <form key="private" className="sc-newchat-form" onSubmit={handleStartPrivateChat}>
            <div className="sc-newchat-field sc-newchat-enter" style={stagger(1)}>
              <label className="sc-newchat-label" htmlFor="new-chat-username">
                <LuUser size={14} aria-hidden="true" />
                {t('newChat.friendUsername')}
              </label>
              <div className="sc-newchat-input-wrap">
                <span className="sc-newchat-input-prefix" aria-hidden="true">
                  @
                </span>
                <input
                  id="new-chat-username"
                  type="text"
                  value={targetNickname}
                  onChange={(event) => {
                    setTargetNickname(event.target.value);
                    setError('');
                  }}
                  placeholder={t('newChat.friendPlaceholder')}
                  maxLength={NICKNAME_MAX_LENGTH + 1}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-describedby="new-chat-username-help"
                  className="sc-newchat-input sc-newchat-input--prefixed"
                />
              </div>
              <small id="new-chat-username-help" className="sc-newchat-help">
                {t('newChat.friendHelp')}
              </small>
            </div>

            {recent.length > 0 && (
              <div className="sc-newchat-recent sc-newchat-enter" style={stagger(2)}>
                <span className="sc-newchat-recent__title" id="new-chat-recent">
                  {t('newChat.recent')}
                </span>
                <div className="sc-newchat-recent__list" role="group" aria-labelledby="new-chat-recent">
                  {recent.map((contact, index) => (
                    <button
                      key={contact.id}
                      type="button"
                      className="sc-newchat-chip"
                      data-active={targetNickname.trim().replace(/^@/, '').toLowerCase() === contact.nickname.toLowerCase()}
                      style={stagger(index)}
                      onClick={() => {
                        setTargetNickname(contact.nickname);
                        setError('');
                      }}
                    >
                      <Avatar userId={contact.id} avatarIndex={contact.avatar} size={24} iconSize={12} />
                      <span className="sc-newchat-chip__name">{contact.nickname}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" disabled={isSubmitting} className="sc-newchat-submit sc-newchat-enter" style={stagger(3)}>
              {isSubmitting ? t('newChat.starting') : t('newChat.start')}
              {submitIcon}
            </button>
          </form>
        ) : (
          <form key="group" className="sc-newchat-form" onSubmit={handleCreateGroup}>
            <div className="sc-newchat-field sc-newchat-enter" style={stagger(1)}>
              <label className="sc-newchat-label" htmlFor="new-chat-group">
                <LuUsers size={14} aria-hidden="true" />
                {t('newChat.createNew')}
              </label>
              <input
                id="new-chat-group"
                type="text"
                value={groupName}
                onChange={(event) => {
                  setGroupName(event.target.value);
                  setError('');
                }}
                placeholder={t('newChat.namePlaceholder')}
                maxLength={GROUP_NAME_MAX_LENGTH}
                autoFocus
                autoComplete="off"
                aria-describedby="new-chat-group-help"
                className="sc-newchat-input"
              />
              <small id="new-chat-group-help" className="sc-newchat-help">
                {t('newChat.nameHelp')}
              </small>
            </div>

            <div className="sc-newchat-note sc-newchat-enter" style={stagger(2)}>
              <LuLink size={14} aria-hidden="true" />
              <span>{t('newChat.joinWithLink')}</span>
            </div>

            <button type="submit" disabled={isSubmitting} className="sc-newchat-submit sc-newchat-enter" style={stagger(3)}>
              {isSubmitting ? t('newChat.creating') : t('newChat.create')}
              {submitIcon}
            </button>
          </form>
        )}

        <p className="sc-newchat-footnote sc-newchat-enter" style={stagger(4)}>
          <LuLock size={12} aria-hidden="true" />
          {t('newChat.e2ee')}
        </p>
      </div>
    </Modal>
  );
}
