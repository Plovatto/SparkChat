import { useEffect, useState } from 'react';
import { FaCheck, FaComments, FaPaperPlane, FaUsers } from 'react-icons/fa';
import { Modal } from '@components/common/Modal';
import { AVATARS } from '@features/auth/constants/avatars';
import { useTheme } from '@features/theme';
import type { RoomParticipant, RoomSummary } from '@features/rooms';
import { useSocket } from '@lib/socket';
import type { ChatMessage } from '../types';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  rooms: RoomSummary[];
  currentUserId: string | undefined;
  message: ChatMessage | null;
}

function getOtherParticipant(room: RoomSummary, userId: string | undefined): RoomParticipant | undefined {
  return room.participants.find((participant) => participant.id !== userId);
}

function getRoomLabel(room: RoomSummary, currentUserId: string | undefined): string {
  if (room.type === 'group') {
    return room.name ?? 'Grupo';
  }

  return getOtherParticipant(room, currentUserId)?.nickname ?? 'Usuário';
}

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

    for (const roomId of selectedRoomIds) {
      socket.emit('message:send', {
        roomId,
        content: message.content,
        type: message.type === 'image' || message.type === 'audio' ? message.type : 'text',
        duration: message.duration ?? undefined,
      });
    }

    setSentRoomIds(new Set(selectedRoomIds));
    setSelectedRoomIds(new Set());
    setTimeout(onClose, 600);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Encaminhar mensagem" theme={theme}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
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
                onClick={() => !wasSent && toggleRoom(room.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  cursor: wasSent ? 'default' : 'pointer',
                  background: isSelected ? `${theme.primary}15` : theme.background,
                  border: `1.5px solid ${isSelected ? theme.primary : theme.border}`,
                }}
              >
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: `${theme.primary}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {room.type === 'group' ? (
                    <FaUsers size={16} color={theme.primary} />
                  ) : avatar ? (
                    <avatar.icon size={18} color={theme.primary} />
                  ) : (
                    <FaComments size={16} color={theme.primary} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0, fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getRoomLabel(room, currentUserId)}
                </div>

                {wasSent ? (
                  <FaCheck size={14} color={theme.primary} />
                ) : (
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: `2px solid ${isSelected ? theme.primary : theme.border}`,
                      background: isSelected ? theme.primary : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isSelected && <FaCheck size={10} color="white" />}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={handleForward}
          disabled={selectedRoomIds.size === 0}
          style={{
            width: '100%',
            padding: '12px 20px',
            borderRadius: '10px',
            border: 'none',
            background: theme.primary,
            color: 'white',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: selectedRoomIds.size === 0 ? 'not-allowed' : 'pointer',
            opacity: selectedRoomIds.size === 0 ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <FaPaperPlane size={14} />
          {selectedRoomIds.size > 0 ? `Encaminhar (${selectedRoomIds.size})` : 'Encaminhar'}
        </button>
      </div>
    </Modal>
  );
}
