import { useState } from 'react';
import { Button } from 'react-bootstrap';
import { FaComments, FaCopy, FaPlus, FaSignOutAlt } from 'react-icons/fa';
import { AVATARS } from '@features/auth/constants/avatars';
import type { User } from '@features/auth';
import { DEFAULT_ROOM_THEME } from '../constants/default-theme';
import type { RoomSummary } from '../types';
import { RoomListItem } from './RoomListItem';

interface SidebarProps {
  user: User;
  rooms: RoomSummary[];
  selectedRoomId: string | null;
  onSelectRoom: (room: RoomSummary) => void;
  onNewChat: () => void;
  onLogout: () => void;
}

export function Sidebar({ user, rooms, selectedRoomId, onSelectRoom, onNewChat, onLogout }: SidebarProps) {
  const [codeCopied, setCodeCopied] = useState(false);
  const theme = DEFAULT_ROOM_THEME;

  const copyCode = () => {
    if (!user.chatCode || !navigator.clipboard) {
      return;
    }

    navigator.clipboard
      .writeText(user.chatCode)
      .then(() => {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      })
      .catch(() => {
        setCodeCopied(false);
      });
  };

  const avatar = AVATARS[user.avatar];

  return (
    <div style={{ height: '100%', background: theme.sidebarBg, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          background: theme.headerGradient,
          padding: '20px',
          color: theme.headerTextColor,
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
          <div
            style={{
              position: 'relative',
              width: '55px',
              height: '55px',
              background: avatar?.bgGradient ?? theme.headerGradient,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
              flexShrink: 0,
            }}
          >
            {avatar ? <avatar.icon size={28} color="white" /> : null}
          </div>
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
              {user.nickname}
            </h5>
            <div style={{ marginTop: '8px' }}>
              <div
                onClick={copyCode}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 8px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
                title="Código para amigos. Clique para copiar"
              >
                <FaCopy size={10} />
                {user.chatCode ?? '------'}
                {codeCopied && <span style={{ fontSize: '0.65rem', marginLeft: '2px' }}>✓</span>}
              </div>
            </div>
          </div>

          <Button
            variant="link"
            onClick={onLogout}
            title="Sair"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: theme.headerTextColor,
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              flexShrink: 0,
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            <FaSignOutAlt size={16} />
          </Button>
        </div>

        <Button
          className="animate__animated animate__pulse"
          onClick={onNewChat}
          style={{
            width: '100%',
            padding: '11px',
            background: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            color: theme.headerTextColor,
            borderRadius: '10px',
            fontSize: '0.95rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
        >
          <FaPlus size={14} /> Novo Chat
        </Button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 12px',
          borderBottom: `1px solid ${theme.border}`,
          background: theme.sidebarBg,
          flexShrink: 0,
        }}
      >
        <h6
          style={{
            padding: '5px 12px',
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            color: theme.textSecondary,
            letterSpacing: '1px',
            fontWeight: 700,
            margin: 0,
          }}
        >
          Conversas
        </h6>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        {rooms.length === 0 ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: theme.textSecondary }}>
            <FaComments size={50} style={{ opacity: 0.3, marginBottom: '15px' }} />
            <p style={{ fontSize: '0.9rem', margin: '5px 0' }}>Nenhuma conversa ainda</p>
            <p style={{ fontSize: '0.85rem', margin: '5px 0', opacity: 0.7 }}>Clique em &quot;Novo Chat&quot;</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {rooms.map((room) => (
              <RoomListItem
                key={room.id}
                room={room}
                user={user}
                isSelected={room.id === selectedRoomId}
                onSelect={() => onSelectRoom(room)}
                theme={theme}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
