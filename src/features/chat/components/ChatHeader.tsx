import { useState } from 'react';
import { Button } from 'react-bootstrap';
import { FaArrowLeft, FaCheck, FaComments, FaCopy, FaUser } from 'react-icons/fa';
import { AVATARS } from '@features/auth/constants/avatars';
import { useTheme } from '@features/theme';
import type { RoomParticipant, RoomSummary } from '@features/rooms';

interface ChatHeaderProps {
  room: RoomSummary;
  currentUserId: string | undefined;
  onBack: () => void;
  onOpenInfo: () => void;
}

function getOtherParticipant(room: RoomSummary, userId: string | undefined): RoomParticipant | undefined {
  return room.participants.find((participant) => participant.id !== userId);
}

export function ChatHeader({ room, currentUserId, onBack, onOpenInfo }: ChatHeaderProps) {
  const { theme } = useTheme();
  const [codeCopied, setCodeCopied] = useState(false);
  const otherUser = room.type === 'private' ? getOtherParticipant(room, currentUserId) : undefined;
  const isOnline = otherUser?.status === 'online';
  const avatar = otherUser ? AVATARS[otherUser.avatar] : undefined;
  const roomName = room.type === 'group' ? (room.name ?? 'Grupo') : (otherUser?.nickname ?? 'Usuário');

  const copyRoomCode = () => {
    if (!room.roomCode || !navigator.clipboard) {
      return;
    }

    navigator.clipboard
      .writeText(room.roomCode)
      .then(() => {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      })
      .catch(() => setCodeCopied(false));
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
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isOnline ? '#10b981' : '#6b7280',
                  display: 'inline-block',
                }}
              />
              {isOnline ? 'Online' : 'Offline'}
            </small>
          )}
          {room.type === 'group' && room.roomCode && (
            <div
              onClick={copyRoomCode}
              style={{
                marginTop: '3px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.70rem',
                fontFamily: 'monospace',
                fontWeight: 600,
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
              {codeCopied ? <FaCheck size={9} /> : <FaCopy size={9} />}
              <span>{room.roomCode}</span>
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
