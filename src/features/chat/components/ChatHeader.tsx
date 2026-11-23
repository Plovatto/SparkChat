import type { CSSProperties } from 'react';
import { FaArrowLeft, FaCheck, FaComments, FaLink, FaPhone, FaUser } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { getOtherParticipant, getRoomDisplayName } from '@features/rooms';
import { blocksNewCall, useOptionalCall } from '@features/calls';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { useTheme } from '@features/theme';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import { shareLinkNatively } from '@lib/share-link';
import type { RoomSummary } from '@lib/socket';
import { useGroupInviteLink } from '../hooks/useGroupInviteLink';
import { isAssistantRoom } from '../utils/assistant';

interface ChatHeaderProps {
  room: RoomSummary;
  currentUserId: string | undefined;
  onBack: () => void;
  onOpenInfo: () => void;
}

const COPY_KEY_LINK = 'link';

export function ChatHeader({ room, currentUserId, onBack, onOpenInfo }: ChatHeaderProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const clipboard = useClipboardCopy();
  const otherUser = room.type === 'private' ? getOtherParticipant(room, currentUserId) : undefined;
  const isOnline = otherUser?.status === 'online';
  const onlineBadge = usePresence(isOnline, MOTION_DURATION_MS.fast);
  const roomName = getRoomDisplayName(room, currentUserId);
  const statusText = isAssistantRoom(room) ? t('chat.assistantStatus') : otherUser?.statusText;
  const invite = useGroupInviteLink(room);
  const call = useOptionalCall();
  const canCall = call !== null && call.canCall(room);
  const callBusy = call !== null && blocksNewCall(call.snapshot.state, room.id);

  const shareInviteLink = () => {
    void invite.createLink().then((link) => {
      if (link && !shareLinkNatively({ text: t('chat.header.inviteText', { name: roomName }), url: link })) {
        clipboard.copy(link, COPY_KEY_LINK);
      }
    });
  };

  return (
    <div
      className="sc-anim-drop-in chat-header-bar"
      style={{
        background: theme.gradient,
        color: theme.onGradient,
        boxShadow: theme.shadowMd,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <button onClick={onBack} title={t('common.back')} className="sc-icon-btn sc-icon-btn--header" style={{ width: '38px', height: '38px' }}>
          <FaArrowLeft size={15} />
        </button>

        {room.type === 'private' ? (
          <Avatar
            userId={otherUser?.id}
            avatarIndex={otherUser?.avatar}
            size={45}
            iconSize={24}
            className="sc-anim-pop-in sc-stagger"
            style={{ boxShadow: theme.shadowSm, '--sc-stagger-index': 1, '--sc-stagger-step': '45ms' } as CSSProperties}
          >
            {onlineBadge.isPresent && (
              <span
                className={onlineBadge.isExiting ? 'sc-anim-pop-out' : 'sc-anim-pop-in'}
                style={{
                  position: 'absolute',
                  bottom: '1px',
                  right: '1px',
                  width: '13px',
                  height: '13px',
                  borderRadius: '50%',
                  background: theme.online,
                  border: `2px solid ${theme.surfaceElevated}`,
                  boxShadow: theme.shadowSm,
                }}
              />
            )}
          </Avatar>
        ) : (
          <Avatar
            roomId={room.id}
            icon={FaComments}
            size={45}
            iconSize={22}
            iconColor={theme.onGradient}
            className="sc-anim-pop-in sc-stagger"
            style={{ '--sc-stagger-index': 1, '--sc-stagger-step': '45ms' } as CSSProperties}
          />
        )}

        <div className="sc-anim-swap-in-left sc-stagger" style={{ flex: 1, minWidth: 0, '--sc-stagger-index': 2, '--sc-stagger-step': '45ms' } as CSSProperties}>
          <h5
            style={{
              margin: 0,
              fontSize: '1.1rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {roomName}
          </h5>
          {room.type === 'private' && (
            <small
              style={{
                fontSize: '0.82rem',
                color: theme.onGradientMuted,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              {!statusText && (
                <span
                  key={isOnline ? 'dot-online' : 'dot-offline'}
                  className="sc-anim-badge-pop"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isOnline ? theme.online : theme.onGradientMuted,
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                key={`text-${statusText || (isOnline ? 'online' : 'offline')}`}
                className="sc-anim-fade-in"
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
              >
                {statusText || (isOnline ? t('presence.online') : t('presence.offline'))}
              </span>
            </small>
          )}
          {room.type === 'group' && (
            <div style={{ marginTop: '2px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <button
                type="button"
                onClick={shareInviteLink}
                disabled={!invite.isAvailable}
                className="sc-chip"
                style={{ height: '18px', padding: '0 8px', fontSize: '0.62rem', fontWeight: 600 }}
                title={invite.isAvailable ? t('chat.header.copyInvite') : t('chat.header.inviteUnavailable')}
              >
                {clipboard.isCopied(COPY_KEY_LINK) ? <FaCheck size={8} className="sc-anim-badge-pop" /> : <FaLink size={8} />}
                <span>{t('chat.header.copyInvite')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {canCall && call && (
          <>
            <button
              onClick={() => call.startCall(room, 'voice')}
              disabled={callBusy}
              title={callBusy ? t('calls.alreadyInCall') : t('chat.header.voiceCall')}
              aria-label={t('chat.header.voiceCall')}
              className="sc-icon-btn sc-icon-btn--header"
              style={{ width: '38px', height: '38px', ...(callBusy ? { filter: 'grayscale(1)', opacity: 0.45, cursor: 'not-allowed' } : {}) }}
            >
              <FaPhone size={15} />
            </button>
          </>
        )}
        <button
          onClick={onOpenInfo}
          title={room.type === 'private' ? t('chat.header.viewProfile') : t('chat.header.viewGroup')}
          className="sc-icon-btn sc-icon-btn--header"
          style={{ width: '38px', height: '38px' }}
        >
          {room.type === 'private' ? <FaUser size={15} /> : <FaComments size={15} />}
        </button>
      </div>
    </div>
  );
}
