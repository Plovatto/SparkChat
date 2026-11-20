import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FaComments, FaUsers } from 'react-icons/fa';
import { LuCheck, LuForward, LuSearch, LuX } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { Modal } from '@components/common/Modal';
import { Spinner } from '@components/common/Spinner';
import { AVATARS } from '@features/auth/constants/avatars';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { getOtherParticipant, getRoomDisplayName } from '@features/rooms';
import { filterRooms } from '@features/rooms/utils/room-filters';
import { translateError } from '@lib/api/api-error';
import type { SessionAuth } from '@lib/api/session-auth';
import { MissingRoomKeyError } from '@lib/e2ee';
import { formatTimeAgo } from '@lib/format';
import { translate } from '@lib/i18n/app-i18n';
import { isGifMimeType } from '@lib/media/media-type';
import { useSocket, type RoomParticipant, type RoomSummary } from '@lib/socket';
import type { ChatMessage } from '../types';
import { forwardMessage } from '../utils/forward-message';
import '../styles/forward-modal.css';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  rooms: RoomSummary[];
  currentUserId: string | undefined;
  messages: ChatMessage[];
  auth: SessionAuth;
}

const CLOSE_AFTER_FORWARD_MS = 600;
const MAX_STAGGERED_ROWS = 8;

function getMessagePreview(message: ChatMessage): string {
  if (message.type === 'image') {
    return message.caption || translate(isGifMimeType(message.fileMeta?.mimeType) ? 'notifications.sentGif' : 'notifications.sentImage');
  }
  if (message.type === 'audio') {
    return translate('notifications.sentAudio');
  }
  if (message.type === 'file') {
    return message.fileMeta ? translate('notifications.sentNamedFile', { name: message.fileMeta.name }) : translate('notifications.sentFile');
  }
  return message.content;
}

function getPresence(participant: RoomParticipant): string {
  if (participant.status === 'online') {
    return translate('presence.online');
  }
  if (participant.lastSeen) {
    try {
      return translate('roomInfo.seen', { time: formatTimeAgo(participant.lastSeen) });
    } catch {
      return translate('presence.offline');
    }
  }
  return translate('presence.offline');
}

function staggerStyle(index: number): CSSProperties {
  return { '--sc-forward-i': index } as CSSProperties;
}

export function ForwardMessageModal({ isOpen, onClose, rooms, currentUserId, messages, auth }: ForwardMessageModalProps) {
  const { t } = useTranslation();
  const { socket } = useSocket();
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [sentRoomIds, setSentRoomIds] = useState<Set<string>>(new Set());
  const [isForwarding, setIsForwarding] = useState(false);
  const [query, setQuery] = useState('');
  const progressByRoomRef = useRef(new Map<string, number>());
  const sessionRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      sessionRef.current += 1;
      progressByRoomRef.current.clear();
      setSelectedRoomIds(new Set());
      setSentRoomIds(new Set());
      setQuery('');
    }
  }, [isOpen]);

  const availableRooms = useMemo(() => rooms.filter((room) => !room.userBlocked && !room.isBlockedBy), [rooms]);
  const visibleRooms = useMemo(() => filterRooms(availableRooms, 'all', query, currentUserId), [availableRooms, query, currentUserId]);
  const firstMessage = messages[0];
  const extraMessages = messages.length - 1;

  const toggleRoom = (roomId: string) => {
    setSelectedRoomIds((previous) => {
      const next = new Set(previous);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  };

  const handleForward = async () => {
    if (!socket || messages.length === 0 || selectedRoomIds.size === 0 || isForwarding) {
      return;
    }

    setIsForwarding(true);
    const session = sessionRef.current;
    const isStale = () => session !== sessionRef.current;
    const sent = new Set<string>();
    try {
      for (const roomId of selectedRoomIds) {
        for (let index = progressByRoomRef.current.get(roomId) ?? 0; index < messages.length; index++) {
          if (isStale()) {
            return;
          }
          const message = messages[index];
          if (message) {
            await forwardMessage(socket, auth, message, roomId);
          }
          if (isStale()) {
            return;
          }
          progressByRoomRef.current.set(roomId, index + 1);
        }
        sent.add(roomId);
        setSentRoomIds((previous) => new Set([...previous, roomId]));
      }
      setSelectedRoomIds(new Set());
      setTimeout(() => {
        if (!isStale()) {
          onClose();
        }
      }, CLOSE_AFTER_FORWARD_MS);
    } catch (error) {
      console.error(error);
      if (isStale()) {
        return;
      }
      setSelectedRoomIds((previous) => new Set([...previous].filter((roomId) => !sent.has(roomId))));
      window.alert(error instanceof MissingRoomKeyError ? translate('errors.e2ee.missingRoomKey') : translateError(error, 'chat.forward.failed'));
    } finally {
      setIsForwarding(false);
    }
  };

  const header = (
    <div className="sc-forward-header">
      <span className="sc-forward-header__icon" aria-hidden="true">
        <LuForward size={17} />
      </span>
      <div className="sc-forward-header__text">
        <h2 className="sc-forward-header__title">{t('chat.forward.title')}</h2>
        <p className="sc-forward-header__subtitle">{t('chat.forward.subtitle')}</p>
      </div>
      <button type="button" onClick={onClose} title={t('common.close')} aria-label={t('common.close')} className="sc-icon-btn sc-icon-btn--header sc-forward-header__close">
        <LuX size={17} />
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      header={header}
      maxWidth="420px"
      panelClassName="sc-forward-panel"
      bodyStyle={{ padding: 0, scrollbarGutter: 'auto', display: 'flex', flexDirection: 'column' }}
    >
      <div className="sc-forward">
        {firstMessage && (
          <div className="sc-forward-preview sc-forward-enter" style={staggerStyle(0)}>
            <div className="sc-forward-preview__label">
              <span>{t('chat.forward.previewLabel')}</span>
              {extraMessages > 0 && <span className="sc-forward-preview__count">{t('chat.forward.moreMessages', { count: extraMessages })}</span>}
            </div>
            <p className="sc-forward-preview__text">{getMessagePreview(firstMessage)}</p>
          </div>
        )}

        <label className="sc-forward-search sc-forward-enter" style={staggerStyle(1)}>
          <LuSearch className="sc-forward-search__icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('sidebar.searchPlaceholder')}
            aria-label={t('sidebar.searchPlaceholder')}
            className="sc-forward-search__input"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="sc-forward-list">
          {availableRooms.length === 0 ? (
            <div className="sc-forward-empty sc-forward-enter" style={staggerStyle(2)}>
              {t('chat.forward.empty')}
            </div>
          ) : visibleRooms.length === 0 ? (
            <div className="sc-forward-empty sc-forward-enter" style={staggerStyle(0)}>
              {t('sidebar.noResults')}
            </div>
          ) : null}

          {visibleRooms.map((room, index) => {
            const isSelected = selectedRoomIds.has(room.id);
            const wasSent = sentRoomIds.has(room.id);
            const otherUser = room.type === 'private' ? getOtherParticipant(room, currentUserId) : undefined;
            const detail =
              room.type === 'group' ? t('chat.forward.groupMembers', { count: room.participants.length }) : otherUser ? getPresence(otherUser) : '';

            return (
              <div
                key={room.id}
                role="checkbox"
                aria-checked={isSelected}
                tabIndex={wasSent ? -1 : 0}
                onClick={() => !wasSent && toggleRoom(room.id)}
                onKeyDown={(event) => {
                  if (!wasSent && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    toggleRoom(room.id);
                  }
                }}
                data-selected={isSelected}
                data-static={wasSent}
                className="sc-forward-row sc-forward-enter"
                style={staggerStyle(2 + Math.min(index, MAX_STAGGERED_ROWS))}
              >
                {room.type === 'group' ? (
                  <Avatar roomId={room.id} icon={FaUsers} tone="soft" size={32} iconSize={14} />
                ) : otherUser && AVATARS[otherUser.avatar] ? (
                  <Avatar userId={otherUser.id} avatarIndex={otherUser.avatar} tone="soft" size={32} iconSize={15} />
                ) : (
                  <Avatar userId={otherUser?.id} icon={FaComments} tone="soft" size={32} iconSize={14} />
                )}

                <div className="sc-forward-row__text">
                  <span className="sc-forward-row__name">{getRoomDisplayName(room, currentUserId)}</span>
                  {detail && (
                    <span className="sc-forward-row__detail" data-online={otherUser?.status === 'online'}>
                      {detail}
                    </span>
                  )}
                </div>

                <span className="sc-forward-check" data-checked={isSelected || wasSent} data-sent={wasSent} aria-hidden="true">
                  {(isSelected || wasSent) && <LuCheck size={12} strokeWidth={3} />}
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void handleForward()}
          disabled={selectedRoomIds.size === 0 || isForwarding}
          className="sc-forward-submit sc-forward-enter"
          style={staggerStyle(3 + Math.min(visibleRooms.length, MAX_STAGGERED_ROWS))}
        >
          {isForwarding ? <Spinner size={14} /> : <LuForward size={16} />}
          {isForwarding
            ? t('chat.forward.sending')
            : selectedRoomIds.size > 0
              ? t('chat.forward.submitTo', { count: selectedRoomIds.size })
              : t('chat.message.forward')}
        </button>
      </div>
    </Modal>
  );
}
