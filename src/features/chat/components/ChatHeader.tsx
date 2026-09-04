import { Button } from 'react-bootstrap';
import { FaArrowLeft, FaCheck, FaComments, FaCopy, FaLink, FaUser } from 'react-icons/fa';
import { AVATARS } from '@features/auth/constants/avatars';
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
        background: theme.headerGradient,
        color: theme.headerTextColor,
        boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <Button
          variant="link"
          onClick={onBack}
          className="d-md-none"
          style={{
            color: 'white',
            padding: '8px',
            borderRadius: '50%',
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.15)',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <FaArrowLeft size={15} />
        </Button>

        {room.type === 'private' ? (
          <div
            style={{
              position: 'relative',
              width: '45px',
              height: '45px',
              background: avatar?.bgGradient ?? theme.headerGradient,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              flexShrink: 0,
            }}
          >
            {avatar ? <avatar.icon size={24} color="white" /> : null}
            {isOnline && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '1px',
                  right: '1px',
                  width: '13px',
                  height: '13px',
                  borderRadius: '50%',
                  background: '#10b981',
                  border: '2px solid white',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
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
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <FaComments size={22} color="white" />
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
                opacity: 0.95,
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
                    background: isOnline ? '#10b981' : '#6b7280',
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
              <div
                onClick={copyRoomCode}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  height: '18px',
                  padding: '0 8px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '0.62rem',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                }}
                title="Clique para copiar o código"
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                  event.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  event.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {clipboard.isCopied(COPY_KEY_CODE) ? <FaCheck size={8} /> : <FaCopy size={8} />}
                <span>{room.roomCode}</span>
              </div>

              <div
                onClick={shareInviteLink}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '18px',
                  width: '18px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '0.62rem',
                  boxSizing: 'border-box',
                }}
                title="Compartilhar link de convite"
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                  event.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  event.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {clipboard.isCopied(COPY_KEY_LINK) ? <FaCheck size={8} /> : <FaLink size={8} />}
              </div>
            </div>
          )}
        </div>
      </div>

      <Button
        variant="link"
        onClick={onOpenInfo}
        title={room.type === 'private' ? 'Ver perfil' : 'Ver informações do grupo'}
        style={{
          color: 'white',
          padding: '8px',
          borderRadius: '50%',
          width: '38px',
          height: '38px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.15)',
          textDecoration: 'none',
          flexShrink: 0,
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = 'rgba(255,255,255,0.25)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = 'rgba(255,255,255,0.15)';
        }}
      >
        {room.type === 'private' ? <FaUser size={15} /> : <FaComments size={15} />}
      </Button>
    </div>
  );
}
