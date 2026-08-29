import { Badge } from 'react-bootstrap';
import { FaBan, FaCheck, FaCheckSquare, FaCircle, FaComments, FaSquare, FaUser } from 'react-icons/fa';
import { AVATARS } from '@features/auth/constants/avatars';
import type { User } from '@features/auth';
import type { RoomThemePalette } from '../constants/default-theme';
import type { RoomParticipant, RoomSummary } from '../types';

interface RoomListItemProps {
  room: RoomSummary;
  user: User;
  isSelected: boolean;
  onSelect: () => void;
  theme: RoomThemePalette;
  isSelectionMode: boolean;
  isChecked: boolean;
  onToggleSelect: () => void;
}

function getOtherParticipant(room: RoomSummary, userId: string | undefined): RoomParticipant | undefined {
  return room.participants.find((participant) => participant.id !== userId);
}

function getRoomName(room: RoomSummary, userId: string | undefined): string {
  if (room.type === 'group') {
    return room.name ?? 'Grupo';
  }

  return getOtherParticipant(room, userId)?.nickname ?? 'Usuário';
}

function getRoomAvatar(room: RoomSummary, userId: string | undefined, theme: RoomThemePalette) {
  if (room.type === 'group') {
    return { icon: <FaComments size={22} color={theme.headerTextColor} />, gradient: theme.headerGradient };
  }

  const otherUser = getOtherParticipant(room, userId);
  if (!otherUser) {
    return { icon: <FaUser size={20} color={theme.textSecondary} />, gradient: theme.headerGradient };
  }

  const avatar = AVATARS[otherUser.avatar] ?? AVATARS[0];
  if (!avatar) {
    return { icon: <FaUser size={20} color={theme.textSecondary} />, gradient: theme.headerGradient };
  }

  const Icon = avatar.icon;
  return { icon: <Icon size={22} color={theme.headerTextColor} />, gradient: avatar.bgGradient };
}

function isRoomParticipantOnline(room: RoomSummary, userId: string | undefined): boolean {
  if (room.type !== 'private') {
    return false;
  }

  return getOtherParticipant(room, userId)?.status === 'online';
}

function LastMessagePreview({ room, user, theme }: { room: RoomSummary; user: User; theme: RoomThemePalette }) {
  const message = room.lastMessage;

  if (!message) {
    return null;
  }

  const previewStyle = {
    fontSize: '0.82rem',
    color: theme.textSecondary,
    margin: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    maxWidth: '100%',
  };

  if (message.deletedForEveryone) {
    return (
      <p style={previewStyle}>
        <span style={{ fontStyle: 'italic', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <FaBan size={14} />
          Mensagem deletada
        </span>
      </p>
    );
  }

  const isOwnMessage = message.sender.id === user.id;
  const readByOthers = message.readBy.some((id) => id !== user.id);

  return (
    <p style={previewStyle}>
      {isOwnMessage && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0px', flexShrink: 0 }}>
          <FaCheck size={12} color={readByOthers ? '#4FC3F7' : '#999'} style={{ marginLeft: '-5px' }} />
          <FaCheck size={12} color={readByOthers ? '#4FC3F7' : '#999'} style={{ marginLeft: '-5px' }} />
        </span>
      )}
      {message.type === 'system' ? (
        <span style={{ fontStyle: 'italic', opacity: 0.7, color: theme.textSecondary }}>
          {message.content.substring(0, 28)}
          {message.content.length > 28 ? '...' : ''}
        </span>
      ) : (
        <>
          {room.type === 'group' && (
            <span style={{ fontWeight: 'bold', marginRight: '4px' }}>
              {room.participants.find((participant) => participant.id === message.sender.id)?.nickname ?? 'Desconhecido'}:
            </span>
          )}
          {message.content.substring(0, 32)}
          {message.content.length > 32 ? '...' : ''}
        </>
      )}
    </p>
  );
}

export function RoomListItem({ room, user, isSelected, onSelect, theme, isSelectionMode, isChecked, onToggleSelect }: RoomListItemProps) {
  const avatar = getRoomAvatar(room, user.id, theme);
  const online = isRoomParticipantOnline(room, user.id);

  return (
    <div
      onClick={isSelectionMode ? onToggleSelect : onSelect}
      className="animate__animated animate__fadeInLeft animate__faster"
      style={{
        background: isSelectionMode
          ? isChecked
            ? `${theme.primary}33`
            : theme.surface
          : isSelected
            ? theme.surfaceLight
            : theme.surface,
        borderRadius: '12px',
        padding: '12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        border: '1.5px solid transparent',
      }}
      onMouseEnter={(event) => {
        if (isSelectionMode) {
          return;
        }
        if (!isSelected) {
          event.currentTarget.style.background = theme.surfaceLight;
        }
      }}
      onMouseLeave={(event) => {
        if (isSelectionMode) {
          return;
        }
        if (!isSelected) {
          event.currentTarget.style.background = theme.surface;
        }
      }}
    >
      {isSelectionMode && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', flexShrink: 0 }}>
          {isChecked ? <FaCheckSquare size={18} color={theme.primary} /> : <FaSquare size={18} color={theme.border} />}
        </div>
      )}
      <div
        style={{
          position: 'relative',
          width: '48px',
          height: '48px',
          background: avatar.gradient,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        {avatar.icon}
        {online && (
          <FaCircle
            size={20}
            color="#4caf50"
            style={{
              position: 'absolute',
              bottom: '-2px',
              right: '-2px',
              background: theme.surface,
              borderRadius: '50%',
              padding: '3px',
              border: `3px solid ${theme.surface}`,
            }}
          />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
            <h6
              style={{
                fontSize: '0.95rem',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontWeight: 600,
                color: theme.text,
                flex: 1,
              }}
            >
              {getRoomName(room, user.id)}
            </h6>
            {room.userBlocked && <FaBan size={12} color="#ff4444" style={{ flexShrink: 0 }} title="Você bloqueou este usuário" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
            {room.unreadCount > 0 && (
              <Badge
                style={{
                  fontSize: '0.7rem',
                  borderRadius: '10px',
                  minWidth: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  background: '#10b981',
                  border: 'none',
                  padding: '0 6px',
                  marginRight: '5px',
                }}
              >
                {room.unreadCount > 99 ? '99+' : room.unreadCount}
              </Badge>
            )}
            {room.lastMessage && (
              <small style={{ fontSize: '0.7rem', color: theme.textSecondary, flexShrink: 0, fontWeight: 500 }}>
                {new Date(room.lastMessage.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </small>
            )}
          </div>
        </div>
        <LastMessagePreview room={room} user={user} theme={theme} />
      </div>
    </div>
  );
}
