import { useEffect, useState } from 'react';
import { FaCheck, FaComments, FaPaperPlane, FaUsers } from 'react-icons/fa';
import { Modal } from '@components/common/Modal';
import { AVATARS } from '@features/auth/constants/avatars';
import { getOtherParticipant, getRoomDisplayName } from '@features/rooms';
import { useTheme } from '@features/theme';
import { useSocket, type RoomSummary } from '@lib/socket';
import type { ChatMessage } from '../types';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  rooms: RoomSummary[];
  currentUserId: string | undefined;
  message: ChatMessage | null;
}

const CLOSE_AFTER_FORWARD_MS = 600;

export function ForwardMessageModal({ isOpen, onClose, rooms, currentUserId, message }: ForwardMessageModalProps) {
  const { theme } = useTheme();
  const { socket } = useSocket();
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [sentRoomIds, setSentRoomIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) {
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

  const handleForward = () => {
    if (!socket || !message || selectedRoomIds.size === 0) {
      return;
    }

    const type = message.type === 'image' || message.type === 'audio' || message.type === 'file' ? message.type : 'text';

    for (const roomId of selectedRoomIds) {
      socket.emit('message:send', {
        roomId,
        content: message.content,
        type,
        duration: message.duration ?? undefined,
        fileMeta: message.fileMeta ?? undefined,
      });
    }

    setSentRoomIds(new Set(selectedRoomIds));
    setSelectedRoomIds(new Set());
    setTimeout(onClose, CLOSE_AFTER_FORWARD_MS);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Encaminhar mensagem">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto', padding: '2px' }}>
          {rooms.length === 0 && (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '20px 0' }}>
              Nenhuma conversa disponível
            </div>
          )}

          {rooms.map((room) => {
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

        <button onClick={handleForward} disabled={selectedRoomIds.size === 0} className="sc-btn sc-btn--primary sc-btn--lift" style={{ width: '100%', padding: '12px 20px' }}>
          <FaPaperPlane size={14} />
          {selectedRoomIds.size > 0 ? `Encaminhar (${selectedRoomIds.size})` : 'Encaminhar'}
        </button>
      </div>
    </Modal>
  );
}
