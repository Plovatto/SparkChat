import { useState, type MouseEvent } from 'react';
import { Button } from 'react-bootstrap';
import { FaCheckSquare, FaCircle, FaComments, FaCopy, FaPalette, FaPlus, FaSignOutAlt, FaSquare, FaTimes, FaTrash } from 'react-icons/fa';
import { AVATARS } from '@features/auth/constants/avatars';
import type { User } from '@features/auth';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { useTheme } from '@features/theme';
import type { RoomSummary } from '../types';
import { EditProfileModal } from './EditProfileModal';
import { RoomListItem } from './RoomListItem';
import { ThemeMenu } from './ThemeMenu';

interface SidebarProps {
  user: User;
  rooms: RoomSummary[];
  selectedRoomId: string | null;
  onSelectRoom: (room: RoomSummary) => void;
  onNewChat: () => void;
  onLogout: () => void;
  onDeleteRooms: (roomIds: string[]) => void;
  typingUserIds: Record<string, string[]>;
  recordingUserIds: Record<string, string[]>;
}

export function Sidebar({
  user,
  rooms,
  selectedRoomId,
  onSelectRoom,
  onNewChat,
  onLogout,
  onDeleteRooms,
  typingUserIds,
  recordingUserIds,
}: SidebarProps) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [themeMenuPosition, setThemeMenuPosition] = useState({ top: 0, right: 0 });
  const { theme } = useTheme();

  const handleThemeButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setThemeMenuPosition({ top: rect.bottom + 10, right: window.innerWidth - rect.right });
    setShowThemeMenu(true);
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode((previous) => !previous);
    setSelectedIds(new Set());
  };

  const toggleRoomSelected = (roomId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((previous) => (previous.size === rooms.length ? new Set() : new Set(rooms.map((room) => room.id))));
  };

  const confirmDelete = () => {
    onDeleteRooms(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

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
            onClick={() => setIsProfileOpen(true)}
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
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.opacity = '0.8';
              event.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.opacity = '1';
              event.currentTarget.style.transform = 'scale(1)';
            }}
            title="Clique para editar perfil"
          >
            {avatar ? <avatar.icon size={28} color="white" /> : null}
            <FaCircle
              size={16}
              color="#4caf50"
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                background: 'white',
                borderRadius: '50%',
                padding: '2px',
                border: '3px solid white',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
              }}
            />
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

          <button
            onClick={handleThemeButtonClick}
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
              cursor: 'pointer',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            <FaPalette size={16} />
          </button>

          <ThemeMenu isOpen={showThemeMenu} position={themeMenuPosition} onClose={() => setShowThemeMenu(false)} />

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
          gap: '8px',
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

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {rooms.length > 0 && (
            <button
              onClick={toggleSelectionMode}
              title={isSelectionMode ? 'Fechar modo seleção' : 'Entrar no modo seleção'}
              style={{
                background: isSelectionMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.08)',
                border: isSelectionMode ? '1.5px solid rgba(239, 68, 68, 0.3)' : `1.5px solid ${theme.border}`,
                color: isSelectionMode ? '#ef4444' : theme.text,
                borderRadius: '8px',
                padding: isSelectionMode ? '6px 8px' : '6px 12px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                justifyContent: 'center',
                minWidth: isSelectionMode ? '32px' : 'auto',
                height: isSelectionMode ? '32px' : 'auto',
                width: isSelectionMode ? '32px' : 'auto',
              }}
              onMouseEnter={(event) => {
                if (!isSelectionMode) {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  event.currentTarget.style.borderColor = theme.primary;
                } else {
                  event.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                  event.currentTarget.style.borderColor = '#ef4444';
                }
              }}
              onMouseLeave={(event) => {
                if (!isSelectionMode) {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  event.currentTarget.style.borderColor = theme.border;
                } else {
                  event.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                  event.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                }
              }}
            >
              {isSelectionMode ? (
                <FaTimes size={14} />
              ) : (
                <>
                  <FaCheckSquare size={12} /> Selecionar
                </>
              )}
            </button>
          )}

          {isSelectionMode && (
            <button
              onClick={toggleSelectAll}
              title={selectedIds.size === rooms.length ? 'Desmarcar tudo' : 'Selecionar tudo'}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: `1.5px solid ${theme.border}`,
                color: theme.text,
                borderRadius: '8px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = theme.surfaceLight;
                event.currentTarget.style.borderColor = theme.primary;
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                event.currentTarget.style.borderColor = theme.border;
              }}
            >
              {selectedIds.size === rooms.length ? (
                <>
                  <FaSquare size={11} />
                  Desmarcar Tudo
                </>
              ) : (
                <>
                  <FaCheckSquare size={11} />
                  Selecionar Tudo
                </>
              )}
            </button>
          )}
        </div>
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
                isSelectionMode={isSelectionMode}
                isChecked={selectedIds.has(room.id)}
                onToggleSelect={() => toggleRoomSelected(room.id)}
                isTyping={(typingUserIds[room.id]?.length ?? 0) > 0}
                isRecording={(recordingUserIds[room.id]?.length ?? 0) > 0}
              />
            ))}
          </div>
        )}
      </div>

      {isSelectionMode && selectedIds.size > 0 && (
        <div
          style={{
            background: theme.surfaceLight,
            borderTop: `1px solid ${theme.border}`,
            padding: '12px',
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={() => setShowConfirmDelete(true)}
            style={{
              background: '#ef4444',
              border: 'none',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = '#dc2626';
              event.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = '#ef4444';
              event.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <FaTrash size={14} />
            Excluir ({selectedIds.size})
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={showConfirmDelete}
        title="Excluir Conversas"
        message={`Tem certeza que quer excluir ${selectedIds.size} conversa${selectedIds.size > 1 ? 's' : ''}? Esta ação não pode ser desfeita.`}
        onConfirm={confirmDelete}
        onCancel={() => setShowConfirmDelete(false)}
        theme={theme}
      />

      <EditProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} user={user} />
    </div>
  );
}
