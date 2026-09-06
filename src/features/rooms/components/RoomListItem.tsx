import { memo, useState, type CSSProperties } from 'react';
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
import { AVATARS, AVATAR_ICON_COLOR } from '@features/auth/constants/avatars';
import { isAssistantRoom } from '@features/chat/utils/assistant';
import { useTheme, type ThemeTokens } from '@features/theme';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { formatAudioTime, getDisplayName, processSystemMessage, resolveActiveUserNames, splitSystemMessageActor } from '@lib/format';
import { getMessageStatus } from '@lib/message-status';
import type { RoomSummary } from '@lib/socket';
import { getOtherParticipant, getRoomDisplayName } from '../utils/room-display';

interface RoomListItemProps {
  room: RoomSummary;
  user: User;
  isSelected: boolean;
  onSelect: (room: RoomSummary) => void;
  isSelectionMode: boolean;
  isChecked: boolean;
  onToggleSelect: (roomId: string) => void;
  typingUserIds: string[];
  recordingUserIds: string[];
  isFavorite: boolean;
  isMuted: boolean;
  entranceIndex?: number;
}

const PREVIEW_LENGTH_SMALL_SCREEN = 70;
const PREVIEW_LENGTH_MEDIUM_SCREEN = 190;
const PREVIEW_LENGTH_LARGE_SCREEN = 100;
const SYSTEM_PREVIEW_LENGTH = 28;

const TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

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

function getRoomAvatar(room: RoomSummary, userId: string | undefined, theme: ThemeTokens) {
  if (room.type === 'group') {
    return { icon: <FaComments size={22} color={theme.onGradient} />, gradient: theme.gradient };
  }

  const otherUser = getOtherParticipant(room, userId);
  if (!otherUser) {
    return { icon: <FaUser size={20} color={theme.onGradient} />, gradient: theme.gradient };
  }

  const avatar = AVATARS[otherUser.avatar] ?? AVATARS[0];
  if (!avatar) {
    return { icon: <FaUser size={20} color={theme.onGradient} />, gradient: theme.gradient };
  }

  const Icon = avatar.icon;
  return { icon: <Icon size={22} color={AVATAR_ICON_COLOR} />, gradient: avatar.bgGradient };
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
}: {
  room: RoomSummary;
  user: User;
  typingUserIds: string[];
  recordingUserIds: string[];
}) {
  const { theme } = useTheme();
  const isRecording = recordingUserIds.length > 0;
  const actorLabel = room.type === 'group' ? resolveActorLabel(isRecording ? recordingUserIds : typingUserIds, room, user.id) : null;

  return (
    <p
      className="sc-anim-fade-in"
      style={{
        fontSize: '0.82rem',
        lineHeight: 1.5,
        color: theme.accentText,
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
          <FaMicrophone size={12} className="sc-anim-pulse-soft" style={{ flexShrink: 0, display: 'block' }} />
          <span style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {actorLabel && <span style={{ fontWeight: 700 }}>{actorLabel} </span>}
            gravando áudio
          </span>
        </>
      ) : (
        <>
          <FaEdit size={12} className="sc-anim-pulse-soft" style={{ flexShrink: 0, display: 'block' }} />
          <span style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {actorLabel && <span style={{ fontWeight: 700 }}>{actorLabel} </span>}
            digitando...
          </span>
        </>
      )}
    </p>
  );
}

function LastMessagePreview({ room, user }: { room: RoomSummary; user: User }) {
  const { theme } = useTheme();
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
        <span style={{ fontStyle: 'italic', color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '4px', lineHeight: 1 }}>
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
        <span style={{ fontStyle: 'italic', color: theme.textMuted, lineHeight: 1.5 }}>
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
          <FaPlay size={12} style={{ flexShrink: 0, display: 'block', color: audioHasBeenPlayed ? theme.audioPlayed : theme.audioFresh }} />
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
            {truncate(message.fileMeta?.name ?? 'Arquivo', previewLength)}
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

  const checkColor = statusInfo?.read ? theme.receiptRead : theme.textMuted;

  return (
    <p className="sc-anim-fade-in" style={previewStyle}>
      {statusInfo && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0px', flexShrink: 0, lineHeight: 1, width: statusInfo.icon === 'double' ? '19px' : '12px' }}>
          {statusInfo.icon === 'double' ? (
            <>
              <FaCheck size={12} color={checkColor} style={{ display: 'block', flexShrink: 0 }} />
              <FaCheck size={12} color={checkColor} style={{ display: 'block', marginLeft: '-5px' }} />
            </>
          ) : (
            <FaCheck size={12} color={theme.textMuted} style={{ display: 'block' }} />
          )}
        </span>
      )}
      {renderContent()}
    </p>
  );
}

export const RoomListItem = memo(function RoomListItem({
  room,
  user,
  isSelected,
  onSelect,
  isSelectionMode,
  isChecked,
  onToggleSelect,
  typingUserIds,
  recordingUserIds,
  isFavorite,
  isMuted,
  entranceIndex = 0,
}: RoomListItemProps) {
  const { theme } = useTheme();
  const [staggerIndex] = useState(entranceIndex);
  const avatar = getRoomAvatar(room, user.id, theme);
  const online = isRoomParticipantOnline(room, user.id);
  const hasUnread = room.unreadCount > 0 && !isSelected;

  const activate = () => {
    if (isSelectionMode) {
      onToggleSelect(room.id);
    } else {
      onSelect(room);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      }}
      data-selected={!isSelectionMode && isSelected}
      data-checked={isSelectionMode && isChecked}
      className="sc-list-item sc-anim-list-in sc-stagger"
      style={
        {
          borderRadius: '12px',
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          '--sc-stagger-index': staggerIndex,
          '--sc-stagger-step': '40ms',
        } as CSSProperties
      }
    >
      {isSelectionMode && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', flexShrink: 0 }}>
          {isChecked ? <FaCheckSquare size={18} color={theme.accentText} /> : <FaSquare size={18} color={theme.borderStrong} />}
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
          boxShadow: theme.shadowSm,
        }}
      >
        {avatar.icon}
        {online && (
          <FaCircle
            size={20}
            color={theme.online}
            className="sc-anim-badge-pop"
            style={{
              position: 'absolute',
              bottom: '-2px',
              right: '-2px',
              background: theme.sidebar,
              borderRadius: '50%',
              padding: '3px',
              border: `3px solid ${theme.sidebar}`,
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
                fontWeight: hasUnread ? 700 : 600,
                color: theme.textPrimary,
                flex: 1,
              }}
            >
              {getRoomDisplayName(room, user.id)}
            </h6>
            {isFavorite && <FaStar size={12} color={theme.warning} style={{ flexShrink: 0 }} />}
            {isMuted && <FaBellSlash size={12} color={theme.textMuted} style={{ flexShrink: 0 }} title="Conversa silenciada" />}
            {room.userBlocked && <FaBan size={12} color={theme.dangerText} style={{ flexShrink: 0 }} title="Você bloqueou este usuário" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
            {room.mentionCount > 0 && (
              <span
                title="Você foi mencionado"
                className="sc-anim-badge-pop"
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: theme.onWarning,
                  background: theme.warning,
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
                    key={unreadLabel}
                    className="sc-anim-badge-pop"
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
                      color: theme.textOnAccent,
                      background: theme.accent,
                      boxShadow: theme.shadowAccent,
                      border: 'none',
                      marginRight: '5px',
                      flexShrink: 0,
                    }}
                  >
                    {unreadLabel}
                  </span>
                );
              })()}
            {isAssistantRoom(room) && <FaThumbtack size={11} color={theme.accentText} style={{ flexShrink: 0 }} title="Conversa fixada" />}
            {room.lastMessage && (
              <small style={{ fontSize: '0.7rem', color: hasUnread ? theme.accentText : theme.textMuted, flexShrink: 0, fontWeight: hasUnread ? 700 : 500 }}>
                {TIME_FORMATTER.format(new Date(room.lastMessage.timestamp))}
              </small>
            )}
          </div>
        </div>
        {typingUserIds.length > 0 || recordingUserIds.length > 0 ? (
          <ActivityPreview room={room} user={user} typingUserIds={typingUserIds} recordingUserIds={recordingUserIds} />
        ) : (
          <LastMessagePreview key={room.lastMessage?.id ?? 'empty'} room={room} user={user} />
        )}
      </div>
    </div>
  );
});
