import { Badge } from 'react-bootstrap';
import {
  FaBan,
  FaBellSlash,
  FaCheck,
  FaCheckSquare,
  FaCircle,
  FaComments,
  FaEdit,
  FaImage,
  FaMicrophone,
  FaPlay,
  FaSquare,
  FaStar,
  FaUser,
} from 'react-icons/fa';
import { AVATARS } from '@features/auth/constants/avatars';
import type { User } from '@features/auth';
import { formatAudioTime, getDisplayName, processSystemMessage, resolveActiveUserNames, splitSystemMessageActor } from '@lib/format';
import { getMessageStatus } from '@lib/message-status';
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
  typingUserIds: string[];
  recordingUserIds: string[];
  isFavorite: boolean;
  isMuted: boolean;
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

function resolveActorLabel(userIds: string[], room: RoomSummary, currentUserId: string | undefined): string | null {
  const [name] = resolveActiveUserNames(userIds, room.participants, currentUserId);
  if (!name) {
    return null;
  }

  return userIds.length > 1 ? `${name} e mais ${userIds.length - 1}` : name;
}

function ActivityPreview({
  room,
  user,
  typingUserIds,
  recordingUserIds,
  theme,
}: {
  room: RoomSummary;
  user: User;
  typingUserIds: string[];
  recordingUserIds: string[];
  theme: RoomThemePalette;
}) {
  const isRecording = recordingUserIds.length > 0;
  const actorLabel = room.type === 'group' ? resolveActorLabel(isRecording ? recordingUserIds : typingUserIds, room, user.id) : null;

  return (
    <p
      style={{
        fontSize: '0.82rem',
        lineHeight: 1,
        color: theme.primary,
        margin: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        maxWidth: '100%',
        fontStyle: 'italic',
      }}
    >
      {isRecording ? (
        <>
          <FaMicrophone size={12} style={{ flexShrink: 0, display: 'block', animation: 'pulse 1.5s infinite' }} />
          <span style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {actorLabel && <span style={{ fontWeight: 700 }}>{actorLabel} </span>}
            gravando áudio
          </span>
        </>
      ) : (
        <>
          <FaEdit size={12} style={{ flexShrink: 0, display: 'block', animation: 'pulse 1.5s infinite' }} />
          <span style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {actorLabel && <span style={{ fontWeight: 700 }}>{actorLabel} </span>}
            digitando...
          </span>
        </>
      )}
    </p>
  );
}

function LastMessagePreview({ room, user, theme }: { room: RoomSummary; user: User; theme: RoomThemePalette }) {
  const message = room.lastMessage;

  if (!message) {
    return null;
  }

  const previewStyle = {
    fontSize: '0.82rem',
    lineHeight: 1.2,
    color: theme.textSecondary,
    margin: 0,
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    maxWidth: '100%',
  };

  if (message.deletedForEveryone) {
    return (
      <p style={previewStyle}>
        <span style={{ fontStyle: 'italic', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '4px', lineHeight: 1 }}>
          <FaBan size={14} style={{ display: 'block', flexShrink: 0 }} />
          Mensagem deletada
        </span>
      </p>
    );
  }

  const isOwnMessage = message.sender.id === user.id;
  const statusInfo = getMessageStatus(message, isOwnMessage, room.type === 'group', room.participants, user.id);
  const audioHasBeenPlayed = isOwnMessage ? message.playedBy.length > 0 : message.playedBy.includes(user.id ?? '');
  const showGroupSender = room.type === 'group' && !isOwnMessage;
  const senderLabel = showGroupSender && (
    <span style={{ fontWeight: 700, flexShrink: 0, lineHeight: 1.2 }}>
      {getDisplayName(
        message.sender.id,
        room.participants.find((participant) => participant.id === message.sender.id)?.nickname ?? 'Desconhecido',
        user.id,
      )}
      :
    </span>
  );

  return (
    <p style={previewStyle}>
      {statusInfo && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0px', flexShrink: 0, lineHeight: 1, width: statusInfo.icon === 'double' ? '19px' : '12px' }}>
          {statusInfo.icon === 'double' ? (
            <>
              <FaCheck size={12} color={statusInfo.read ? '#4FC3F7' : '#999'} style={{ display: 'block', flexShrink: 0 }} />
              <FaCheck size={12} color={statusInfo.read ? '#4FC3F7' : '#999'} style={{ display: 'block', marginLeft: '-5px' }} />
            </>
          ) : (
            <FaCheck size={12} color="#999" style={{ display: 'block' }} />
          )}
        </span>
      )}
      {message.type === 'system' ? (
        (() => {
          const processed = processSystemMessage(message.content, user.nickname);
          const truncated = processed.substring(0, 28) + (processed.length > 28 ? '...' : '');
          const split = splitSystemMessageActor(truncated);
          return (
            <span style={{ fontStyle: 'italic', opacity: 0.7, color: theme.textSecondary, lineHeight: 1 }}>
              {split ? (
                <>
                  <span style={{ fontWeight: 700 }}>{split.actor}</span>
                  {split.rest}
                </>
              ) : (
                truncated
              )}
            </span>
          );
        })()
      ) : message.type === 'image' ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, lineHeight: 1.25 }}>
          {senderLabel}
          <FaImage size={12} style={{ flexShrink: 0, display: 'block', transform: 'translateY(1px)' }} />
          <span style={{ flexShrink: 0, lineHeight: 1.2 }}>Imagem</span>
        </span>
      ) : message.type === 'audio' ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, lineHeight: 1.25 }}>
          {senderLabel}
          <FaPlay size={12} style={{ flexShrink: 0, display: 'block', color: audioHasBeenPlayed ? '#2196F3' : '#35dd3b' }} />
          <span style={{ flexShrink: 0, lineHeight: 1 }}>Áudio {formatAudioTime(message.duration ?? 0)}</span>
        </span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, lineHeight: 1.25, overflow: 'hidden' }}>
          {senderLabel}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
            {message.content.substring(0, 32)}
            {message.content.length > 32 ? '...' : ''}
          </span>
        </span>
      )}
    </p>
  );
}

export function RoomListItem({
  room,
  user,
  isSelected,
  onSelect,
  theme,
  isSelectionMode,
  isChecked,
  onToggleSelect,
  typingUserIds,
  recordingUserIds,
  isFavorite,
  isMuted,
}: RoomListItemProps) {
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
            {isFavorite && <FaStar size={12} color="#fbbf24" style={{ flexShrink: 0 }} />}
            {isMuted && <FaBellSlash size={12} color={theme.textSecondary} style={{ flexShrink: 0 }} title="Conversa silenciada" />}
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
        {typingUserIds.length > 0 || recordingUserIds.length > 0 ? (
          <ActivityPreview room={room} user={user} typingUserIds={typingUserIds} recordingUserIds={recordingUserIds} theme={theme} />
        ) : (
          <LastMessagePreview room={room} user={user} theme={theme} />
        )}
      </div>
    </div>
  );
}
