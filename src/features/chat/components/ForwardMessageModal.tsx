import { useEffect, useRef, useState } from 'react';
import { FaCheck, FaComments, FaPaperPlane, FaUsers } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { Modal } from '@components/common/Modal';
import { Spinner } from '@components/common/Spinner';
import { AVATARS } from '@features/auth/constants/avatars';
import { getOtherParticipant, getRoomDisplayName } from '@features/rooms';
import { useTheme } from '@features/theme';
import { translateError } from '@lib/api/api-error';
import type { SessionAuth } from '@lib/api/session-auth';
import { MissingRoomKeyError } from '@lib/e2ee';
import { translate } from '@lib/i18n/app-i18n';
import { useSocket, type RoomSummary } from '@lib/socket';
import type { ChatMessage } from '../types';
import { forwardMessage } from '../utils/forward-message';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  rooms: RoomSummary[];
  currentUserId: string | undefined;
  messages: ChatMessage[];
  auth: SessionAuth;
}

const CLOSE_AFTER_FORWARD_MS = 600;

export function ForwardMessageModal({ isOpen, onClose, rooms, currentUserId, messages, auth }: ForwardMessageModalProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { socket } = useSocket();
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [sentRoomIds, setSentRoomIds] = useState<Set<string>>(new Set());
  const [isForwarding, setIsForwarding] = useState(false);
  const progressByRoomRef = useRef(new Map<string, number>());
  const sessionRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      sessionRef.current += 1;
      progressByRoomRef.current.clear();
      setSelectedRoomIds(new Set());
      setSentRoomIds(new Set());
    }
  }, [isOpen]);

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('chat.forward.title')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto', padding: '2px' }}>
          {rooms.length === 0 && (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '20px 0' }}>
              {t('chat.forward.empty')}
            </div>
          )}

          {rooms.filter((room) => !room.userBlocked && !room.isBlockedBy).map((room) => {
            const isSelected = selectedRoomIds.has(room.id);
            const wasSent = sentRoomIds.has(room.id);
            const otherUser = room.type === 'private' ? getOtherParticipant(room, currentUserId) : undefined;
            const avatar = otherUser ? AVATARS[otherUser.avatar] : undefined;

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
                className="sc-card sc-card--interactive"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  borderWidth: '1.5px',
                }}
              >
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: theme.accentSoft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {room.type === 'group' ? (
                    <FaUsers size={16} color={theme.accentText} />
                  ) : avatar ? (
                    <avatar.icon size={18} color={theme.accentText} />
                  ) : (
                    <FaComments size={16} color={theme.accentText} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0, fontWeight: 600, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getRoomDisplayName(room, currentUserId)}
                </div>

                {wasSent ? (
                  <FaCheck size={14} color={theme.successText} />
                ) : (
                  <span className="sc-checkbox" data-checked={isSelected}>
                    {isSelected && <FaCheck size={10} />}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => void handleForward()}
          disabled={selectedRoomIds.size === 0 || isForwarding}
          className="sc-btn sc-btn--primary sc-btn--lift"
          style={{ width: '100%', padding: '12px 20px' }}
        >
          {isForwarding ? <Spinner size={14} /> : <FaPaperPlane size={14} />}
          {isForwarding
            ? t('chat.forward.sending')
            : selectedRoomIds.size > 0
              ? t('chat.forward.submitCount', { count: selectedRoomIds.size })
              : t('chat.message.forward')}
        </button>
      </div>
    </Modal>
  );
}
