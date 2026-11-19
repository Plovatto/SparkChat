import type { CSSProperties } from 'react';
import { FaArrowLeft, FaCheck, FaComments, FaLink, FaPhone, FaUser } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { AVATARS, AVATAR_ICON_COLOR } from '@features/auth/constants/avatars';
import { getOtherParticipant, getRoomDisplayName } from '@features/rooms';
import { useOptionalCall } from '@features/calls';
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
  const avatar = otherUser ? AVATARS[otherUser.avatar] : undefined;
  const roomName = getRoomDisplayName(room, currentUserId);
  const statusText = isAssistantRoom(room) ? t('chat.assistantStatus') : otherUser?.statusText;
  const invite = useGroupInviteLink(room);
  const call = useOptionalCall();
  const canCall = call !== null && call.canCall(room);
  const callBusy = call !== null && call.snapshot.state.phase !== 'idle' && call.snapshot.state.phase !== 'ended';

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
          <div
            className="sc-anim-pop-in sc-stagger"
            style={
              {
                position: 'relative',
                width: '45px',
                height: '45px',
                background: avatar?.bgGradient ?? theme.gradientControl,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: theme.shadowSm,
                flexShrink: 0,
                '--sc-stagger-index': 1,
                '--sc-stagger-step': '45ms',
              } as CSSProperties
            }
          >
            {avatar ? <avatar.icon size={24} color={AVATAR_ICON_COLOR} /> : null}
            {isOnline && (
              <span
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
          </div>
        ) : (
          <div
            className="sc-anim-pop-in sc-stagger"
            style={
              {
                width: '45px',
                height: '45px',
                borderRadius: '50%',
                background: theme.gradientControl,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                '--sc-stagger-index': 1,
                '--sc-stagger-step': '45ms',
              } as CSSProperties
            }
          >
            <FaComments size={22} color={theme.onGradient} />
          </div>
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
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
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
