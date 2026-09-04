import {
  FaAt,
  FaBan,
  FaBellSlash,
  FaCheck,
  FaCheckSquare,
  FaCircle,
  FaComments,
  FaEdit,
  FaImage,
  FaMicrophone,
  FaPaperclip,
  FaPlay,
  FaSquare,
  FaStar,
  FaThumbtack,
  FaUser,
  FaVideo,
} from 'react-icons/fa';
import { MEDIUM_SCREEN_MIN_WIDTH_PX, minWidthQuery, SPLIT_LAYOUT_MIN_WIDTH_PX } from '@constants/breakpoints';
import type { User } from '@features/auth';
import { AVATARS } from '@features/auth/constants/avatars';
import { isAssistantRoom } from '@features/chat/utils/assistant';
import type { ThemePalette } from '@features/theme';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { formatAudioTime, getDisplayName, processSystemMessage, resolveActiveUserNames, splitSystemMessageActor } from '@lib/format';
import { getMessageStatus } from '@lib/message-status';
import type { RoomSummary } from '@lib/socket';
import { getOtherParticipant, getRoomDisplayName } from '../utils/room-display';

interface RoomListItemProps {
  room: RoomSummary;
  user: User;
  isSelected: boolean;
  onSelect: () => void;
  theme: ThemePalette;
  isSelectionMode: boolean;
  isChecked: boolean;
  onToggleSelect: () => void;
  typingUserIds: string[];
  recordingUserIds: string[];
  isFavorite: boolean;
  isMuted: boolean;
}

const PREVIEW_LENGTH_SMALL_SCREEN = 70;
const PREVIEW_LENGTH_MEDIUM_SCREEN = 190;
const PREVIEW_LENGTH_LARGE_SCREEN = 100;
const SYSTEM_PREVIEW_LENGTH = 28;
const FILE_NAME_PREVIEW_LENGTH = 35;

function useMessagePreviewLength(): number {
  const isSplitLayout = useMediaQuery(minWidthQuery(SPLIT_LAYOUT_MIN_WIDTH_PX));
  const isMediumScreen = useMediaQuery(minWidthQuery(MEDIUM_SCREEN_MIN_WIDTH_PX));

  if (isSplitLayout) {
    return PREVIEW_LENGTH_LARGE_SCREEN;
  }
  if (isMediumScreen) {
    return PREVIEW_LENGTH_MEDIUM_SCREEN;
  }
  return PREVIEW_LENGTH_SMALL_SCREEN;
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
}

function getRoomAvatar(room: RoomSummary, userId: string | undefined, theme: ThemePalette) {
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
  theme: ThemePalette;
}) {
  const isRecording = recordingUserIds.length > 0;
  const actorLabel = room.type === 'group' ? resolveActorLabel(isRecording ? recordingUserIds : typingUserIds, room, user.id) : null;

  return (
    <p
      style={{
        fontSize: '0.82rem',
        lineHeight: 1.5,
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

function LastMessagePreview({ room, user, theme }: { room: RoomSummary; user: User; theme: ThemePalette }) {
  const message = room.lastMessage;
  const previewLength = useMessagePreviewLength();

  if (!message) {
    return null;
  }

  const previewStyle = {
    fontSize: '0.82rem',
    lineHeight: 1.5,
    color: theme.textSecondary,
    margin: 0,
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis' as const,
    overflow: 'hidden' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    maxWidth: '100%',
    minWidth: 0,
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
  const audioHasBeenPlayed = isOwnMessage ? message.playedBy.length > 0 : message.playedBy.includes(user.id);
  const showGroupSender = room.type === 'group' && !isOwnMessage;
  const senderLabel = showGroupSender && (
    <span style={{ fontWeight: 700, flexShrink: 0, lineHeight: 1.5 }}>
      {getDisplayName(
        message.sender.id,
        room.participants.find((participant) => participant.id === message.sender.id)?.nickname ?? 'Desconhecido',
        user.id,
      )}
      :
    </span>
  );

  const renderContent = () => {
    if (message.type === 'system') {
      const truncated = truncate(processSystemMessage(message.content, user.nickname), SYSTEM_PREVIEW_LENGTH);
      const split = splitSystemMessageActor(truncated);
      return (
        <span style={{ fontStyle: 'italic', opacity: 0.7, color: theme.textSecondary, lineHeight: 1.5 }}>
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
    }

    if (message.type === 'image') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, lineHeight: 1.5 }}>
          {senderLabel}
          <FaImage size={12} style={{ flexShrink: 0, display: 'block', transform: 'translateY(1px)' }} />
          <span style={{ flexShrink: 0, lineHeight: 1.5 }}>Imagem</span>
        </span>
      );
    }

    if (message.type === 'audio') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, lineHeight: 1.5 }}>
          {senderLabel}
          <FaPlay size={12} style={{ flexShrink: 0, display: 'block', color: audioHasBeenPlayed ? '#2196F3' : '#35dd3b' }} />
          <span style={{ flexShrink: 0, lineHeight: 1.5 }}>Áudio {formatAudioTime(message.duration ?? 0)}</span>
        </span>
      );
    }

    if (message.type === 'file') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, lineHeight: 1.5, overflow: 'hidden' }}>
          {senderLabel}
          {message.fileMeta?.mimeType.startsWith('video/') ? (
            <FaVideo size={12} style={{ flexShrink: 0, display: 'block' }} />
          ) : (
            <FaPaperclip size={12} style={{ flexShrink: 0, display: 'block' }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.5 }}>
            {truncate(message.fileMeta?.name ?? 'Arquivo', FILE_NAME_PREVIEW_LENGTH)}
          </span>
        </span>
      );
    }

    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, lineHeight: 1.5, overflow: 'hidden' }}>
        {senderLabel}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.5 }}>{truncate(message.content, previewLength)}</span>
      </span>
    );
  };

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
      {renderContent()}
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
              {getRoomDisplayName(room, user.id)}
            </h6>
            {isFavorite && <FaStar size={12} color="#fbbf24" style={{ flexShrink: 0 }} />}
            {isMuted && <FaBellSlash size={12} color={theme.textSecondary} style={{ flexShrink: 0 }} title="Conversa silenciada" />}
            {room.userBlocked && <FaBan size={12} color="#ff4444" style={{ flexShrink: 0 }} title="Você bloqueou este usuário" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
            {room.mentionCount > 0 && (
              <span
                title="Você foi mencionado"
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  background: '#f59e0b',
                  flexShrink: 0,
                }}
              >
                <FaAt size={10} />
              </span>
            )}
            {room.unreadCount > 0 &&
              (() => {
                const unreadLabel = room.unreadCount > 99 ? '99+' : String(room.unreadCount);
                const diameter = unreadLabel.length === 1 ? 20 : unreadLabel.length === 2 ? 23 : 27;

                return (
                  <span
                    style={{
                      fontSize: unreadLabel.length > 2 ? '0.6rem' : '0.7rem',
                      borderRadius: '50%',
                      width: `${diameter}px`,
                      height: `${diameter}px`,
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      color: 'white',
                      background: theme.primary,
                      border: 'none',
                      marginRight: '5px',
                      flexShrink: 0,
                    }}
                  >
                    {unreadLabel}
                  </span>
                );
              })()}
            {isAssistantRoom(room) && <FaThumbtack size={11} color="#ffffff" style={{ flexShrink: 0 }} title="Conversa fixada" />}
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
