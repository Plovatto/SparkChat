import { FaArrowLeft, FaCheck, FaComments, FaCopy, FaLink, FaUser } from 'react-icons/fa';
import { AVATARS, AVATAR_ICON_COLOR } from '@features/auth/constants/avatars';
import { getOtherParticipant, getRoomDisplayName } from '@features/rooms';
import { useTheme } from '@features/theme';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import { shareLinkNatively } from '@lib/share-link';
import type { RoomSummary } from '@lib/socket';

interface ChatHeaderProps {
  room: RoomSummary;
  currentUserId: string | undefined;
  onBack: () => void;
  onOpenInfo: () => void;
}

const COPY_KEY_CODE = 'code';
const COPY_KEY_LINK = 'link';

export function ChatHeader({ room, currentUserId, onBack, onOpenInfo }: ChatHeaderProps) {
  const { theme } = useTheme();
  const clipboard = useClipboardCopy();
  const otherUser = room.type === 'private' ? getOtherParticipant(room, currentUserId) : undefined;
  const isOnline = otherUser?.status === 'online';
  const avatar = otherUser ? AVATARS[otherUser.avatar] : undefined;
  const roomName = getRoomDisplayName(room, currentUserId);

  const copyRoomCode = () => {
    if (room.roomCode) {
      clipboard.copy(room.roomCode, COPY_KEY_CODE);
    }
  };

  const shareInviteLink = () => {
    if (!room.roomCode) {
      return;
    }

    const link = `${window.location.origin}${window.location.pathname}?join=${room.roomCode}`;
    if (!shareLinkNatively({ text: `Entre no grupo "${roomName}" no SparkChat!`, url: link })) {
      clipboard.copy(link, COPY_KEY_LINK);
    }
  };

  return (
    <div
      className="animate__animated animate__fadeInDown animate__faster chat-header-bar"
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
        <button onClick={onBack} title="Voltar" className="sc-icon-btn sc-icon-btn--header" style={{ width: '38px', height: '38px' }}>
          <FaArrowLeft size={15} />
        </button>

        {room.type === 'private' ? (
          <div
            style={{
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
            }}
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
            style={{
              width: '45px',
              height: '45px',
              borderRadius: '50%',
              background: theme.gradientControl,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <FaComments size={22} color={theme.onGradient} />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
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
              {!otherUser?.statusText && (
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
                {otherUser?.statusText || (isOnline ? 'Online' : 'Offline')}
              </span>
            </small>
          )}
          {room.type === 'group' && room.roomCode && (
            <div style={{ marginTop: '2px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <button
                type="button"
                onClick={copyRoomCode}
                className="sc-chip"
                style={{ height: '18px', padding: '0 8px', fontSize: '0.62rem', fontFamily: 'monospace', fontWeight: 600 }}
                title="Clique para copiar o código"
              >
                {clipboard.isCopied(COPY_KEY_CODE) ? <FaCheck size={8} /> : <FaCopy size={8} />}
                <span>{room.roomCode}</span>
              </button>

              <button
                type="button"
                onClick={shareInviteLink}
                className="sc-chip"
                style={{ height: '18px', width: '18px', justifyContent: 'center', padding: 0, fontSize: '0.62rem' }}
                title="Compartilhar link de convite"
              >
                {clipboard.isCopied(COPY_KEY_LINK) ? <FaCheck size={8} /> : <FaLink size={8} />}
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onOpenInfo}
        title={room.type === 'private' ? 'Ver perfil' : 'Ver informações do grupo'}
        className="sc-icon-btn sc-icon-btn--header"
        style={{ width: '38px', height: '38px' }}
      >
        {room.type === 'private' ? <FaUser size={15} /> : <FaComments size={15} />}
      </button>
    </div>
  );
}
