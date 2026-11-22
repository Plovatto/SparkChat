import { memo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { LuPhoneIncoming, LuPhoneMissed, LuPhoneOutgoing, LuVideo, LuVideoOff } from 'react-icons/lu';
import { MdGif } from 'react-icons/md';
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
import { localizeAssistantWelcome } from '@features/chat/utils/assistant-welcome';
import { Avatar, type AvatarProps } from '@features/profile-photos/components/Avatar';
import { MOTION_DURATION_MS, useChangedSinceMount, useLatchedPresence } from '@features/motion';
import { useTheme, type ThemeTokens } from '@features/theme';
import { useMediaQuery } from '@hooks/useMediaQuery';
import {
  describeCallPreview,
  formatAudioTime,
  formatTime,
  getDisplayName,
  isCallEvent,
  resolveActiveUserNames,
  systemMessageSegments,
  type CallPreview,
  type CallPreviewGlyph,
  type SystemEvent,
} from '@lib/format';
import { translate, useAppLanguage } from '@lib/i18n/app-i18n';
import { isGifMimeType } from '@lib/media/media-type';
import { getMessageStatus } from '@lib/message-status';
import type { RoomSummary } from '@lib/socket';
import { getOtherParticipant, getRoomDisplayName } from '../utils/room-display';
import '../styles/room-call-preview.css';

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
  onOpenOptions: (roomId: string) => boolean;
  entranceIndex?: number;
}

const PREVIEW_LENGTH_SMALL_SCREEN = 45;
const PREVIEW_LENGTH_MEDIUM_SCREEN = 120;
const PREVIEW_LENGTH_LARGE_SCREEN = 60;

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

type RoomAvatarProps = Pick<AvatarProps, 'userId' | 'roomId' | 'avatarIndex' | 'icon' | 'iconSize' | 'iconColor' | 'background'>;

function getRoomAvatar(room: RoomSummary, userId: string | undefined, theme: ThemeTokens): RoomAvatarProps {
  if (room.type === 'group') {
    return { roomId: room.id, icon: FaComments, iconSize: 22, iconColor: theme.onGradient, background: theme.gradient };
  }

  const otherUser = getOtherParticipant(room, userId);
  if (!otherUser) {
    return { icon: FaUser, iconSize: 20, iconColor: theme.onGradient, background: theme.gradient };
  }

  return { userId: otherUser.id, avatarIndex: AVATARS[otherUser.avatar] ? otherUser.avatar : 0, iconSize: 22 };
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

  return userIds.length > 1 ? translate('rooms.preview.andMore', { name, count: userIds.length - 1 }) : name;
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
  const { t } = useTranslation();
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
            {t('rooms.preview.recording')}
          </span>
        </>
      ) : (
        <>
          <FaEdit size={12} className="sc-anim-pulse-soft" style={{ flexShrink: 0, display: 'block' }} />
          <span style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {actorLabel && <span style={{ fontWeight: 700 }}>{actorLabel} </span>}
            {t('rooms.preview.typing')}
          </span>
        </>
      )}
    </p>
  );
}

const CALL_PREVIEW_ICONS: Record<CallPreviewGlyph, IconType> = {
  'voice-outgoing': LuPhoneOutgoing,
  'voice-incoming': LuPhoneIncoming,
  'voice-missed': LuPhoneMissed,
  video: LuVideo,
  'video-off': LuVideoOff,
};

function CallEventPreviewContent({ preview }: { preview: CallPreview }) {
  const Icon = CALL_PREVIEW_ICONS[preview.glyph];

  return (
    <span className="sc-call-preview__body" title={preview.fullText}>
      <span className="sc-call-preview__glyph" aria-hidden="true">
        <Icon />
      </span>
      <span className="sc-call-preview__text" aria-hidden="true">
        <span className="sc-call-preview__label">{preview.label}</span>
        {preview.detail && <span className="sc-call-preview__detail"> · {preview.detail}</span>}
      </span>
      <span className="sc-sr-only">{preview.fullText}</span>
    </span>
  );
}

function resolveCallPreview(message: { type: string; systemEvent?: SystemEvent | null }, userId: string): CallPreview | null {
  if (message.type !== 'system' || !message.systemEvent || !isCallEvent(message.systemEvent)) {
    return null;
  }
  return describeCallPreview(message.systemEvent, userId);
}

function LastMessagePreview({ room, user }: { room: RoomSummary; user: User }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const message = room.lastMessage;
  const previewLength = useMessagePreviewLength();
  const { language } = useAppLanguage();

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
          {t('chat.deleted')}
        </span>
      </p>
    );
  }

  const isOwnMessage = message.sender.id === user.id;
  const content = (isAssistantRoom(room) && !isOwnMessage ? localizeAssistantWelcome(message.content, language) : null) ?? message.content;
  const statusInfo = getMessageStatus(message, isOwnMessage, room.type === 'group', room.participants, user.id);
  const audioHasBeenPlayed = isOwnMessage ? message.playedBy.length > 0 : message.playedBy.includes(user.id);
  const showGroupSender = room.type === 'group' && !isOwnMessage;
  const senderLabel = showGroupSender && (
    <span style={{ fontWeight: 700, flexShrink: 0, lineHeight: 1.5 }}>
      {getDisplayName(
        message.sender.id,
        room.participants.find((participant) => participant.id === message.sender.id)?.nickname ?? message.sender.nickname,
        user.id,
        message.sender.unknown,
      )}
      :
    </span>
  );

  const callPreview = resolveCallPreview(message, user.id);

  const renderContent = () => {
    if (callPreview) {
      return <CallEventPreviewContent preview={callPreview} />;
    }

    if (message.type === 'system' || message.type === 'error') {
      return (
        <span style={{ fontStyle: 'italic', color: theme.textMuted, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {systemMessageSegments(message, user.nickname).map((segment, index) =>
            segment.isName ? (
              <span key={index} style={{ fontWeight: 700 }}>
                {segment.text}
              </span>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </span>
      );
    }

    if (message.type === 'image') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, lineHeight: 1.5 }}>
          {senderLabel}
          {isGifMimeType(message.fileMeta?.mimeType) ? (
            <>
              <MdGif size={18} aria-hidden="true" style={{ flexShrink: 0, display: 'block' }} />
              <span style={{ flexShrink: 0, lineHeight: 1.5 }}>{t('chat.message.gif')}</span>
            </>
          ) : (
            <>
              <FaImage size={12} style={{ flexShrink: 0, display: 'block', transform: 'translateY(1px)' }} />
              <span style={{ flexShrink: 0, lineHeight: 1.5 }}>{t('chat.message.image')}</span>
            </>
          )}
        </span>
      );
    }

    if (message.type === 'audio') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, lineHeight: 1.5 }}>
          {senderLabel}
          <FaPlay size={12} style={{ flexShrink: 0, display: 'block', color: audioHasBeenPlayed ? theme.audioPlayed : theme.audioFresh }} />
          <span style={{ flexShrink: 0, lineHeight: 1.5 }}>{t('chat.message.audio', { duration: formatAudioTime(message.duration ?? 0) })}</span>
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
            {truncate(message.fileMeta?.name ?? t('common.file'), previewLength)}
          </span>
        </span>
      );
    }

    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, lineHeight: 1.5, overflow: 'hidden' }}>
        {senderLabel}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.5 }}>{truncate(content, previewLength)}</span>
      </span>
    );
  };

  const checkColor = statusInfo?.read ? theme.receiptRead : theme.textMuted;

  return (
    <p
      className={callPreview ? 'sc-call-preview' : 'sc-anim-fade-in'}
      data-tone={callPreview?.tone}
      data-missed={callPreview ? String(callPreview.missed) : undefined}
      style={previewStyle}
    >
      {statusInfo && !callPreview && (
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
  onOpenOptions,
  entranceIndex = 0,
}: RoomListItemProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [staggerIndex] = useState(entranceIndex);
  const [hasEntered, setHasEntered] = useState(false);
  const lastPointerTypeRef = useRef<string | null>(null);
  const avatar = getRoomAvatar(room, user.id, theme);
  const online = isRoomParticipantOnline(room, user.id);
  const hasUnread = room.unreadCount > 0 && !isSelected;
  const unreadBadge = useLatchedPresence(room.unreadCount > 0 ? (room.unreadCount > 99 ? '99+' : String(room.unreadCount)) : null, MOTION_DURATION_MS.fast);
  const animateFavorite = useChangedSinceMount(isFavorite);
  const animateMuted = useChangedSinceMount(isMuted);

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
      onPointerDown={(event) => {
        lastPointerTypeRef.current = event.pointerType;
      }}
      onContextMenu={(event) => {
        if (lastPointerTypeRef.current === 'touch') {
          return;
        }
        if (onOpenOptions(room.id)) {
          event.preventDefault();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      }}
      data-flip-key={room.id}
      data-selected={!isSelectionMode && isSelected}
      data-checked={isSelectionMode && isChecked}
      className={hasEntered ? 'sc-list-item' : 'sc-list-item sc-anim-list-in sc-stagger'}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) {
          setHasEntered(true);
        }
      }}
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
      <Avatar {...avatar} size={48} style={{ boxShadow: theme.shadowSm }}>
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
      </Avatar>
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
            {isFavorite && <FaStar size={12} color={theme.warning} className={animateFavorite ? 'sc-toggle-pop' : undefined} style={{ flexShrink: 0 }} />}
            {isMuted && (
              <FaBellSlash size={12} color={theme.textMuted} className={animateMuted ? 'sc-toggle-pop' : undefined} style={{ flexShrink: 0 }} title={t('rooms.muted')} />
            )}
            {room.userBlocked && <FaBan size={12} color={theme.dangerText} style={{ flexShrink: 0 }} title={t('chat.youBlocked')} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
            {isAssistantRoom(room) && <FaThumbtack size={11} color={theme.accentText} style={{ flexShrink: 0 }} title={t('rooms.pinned')} />}
            {room.lastMessage && (
              <small style={{ fontSize: '0.7rem', color: hasUnread ? theme.accentText : theme.textMuted, flexShrink: 0, fontWeight: hasUnread ? 700 : 500 }}>
                {formatTime(room.lastMessage.timestamp)}
              </small>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {typingUserIds.length > 0 || recordingUserIds.length > 0 ? (
              <ActivityPreview room={room} user={user} typingUserIds={typingUserIds} recordingUserIds={recordingUserIds} />
            ) : (
              <LastMessagePreview key={room.lastMessage?.id ?? 'empty'} room={room} user={user} />
            )}
          </div>
          {room.mentionCount > 0 && (
            <span
              title={t('rooms.mentioned')}
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
          {unreadBadge.value !== null &&
            (() => {
              const unreadLabel = unreadBadge.value;
              const diameter = unreadLabel.length === 1 ? 20 : unreadLabel.length === 2 ? 23 : 27;

              return (
                <span
                  key={unreadLabel}
                  className={unreadBadge.isExiting ? 'sc-badge-out' : 'sc-anim-badge-pop'}
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
                    flexShrink: 0,
                  }}
                >
                  {unreadLabel}
                </span>
              );
            })()}
        </div>
      </div>
    </div>
  );
});
