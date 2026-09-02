import { useState, type MouseEvent } from 'react';
import { Button } from 'react-bootstrap';
import {
  FaBell,
  FaBellSlash,
  FaCheck,
  FaCheckCircle,
  FaCheckSquare,
  FaCircle,
  FaComments,
  FaCopy,
  FaPalette,
  FaPlus,
  FaSignOutAlt,
  FaSquare,
  FaStar,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';
import { AVATARS } from '@features/auth/constants/avatars';
import type { User } from '@features/auth';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { useTheme } from '@features/theme';
import { useFavoriteRooms } from '../hooks/useFavoriteRooms';
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
  notificationsSupported: boolean;
  notificationsEnabled: boolean;
  notificationsBlocked: boolean;
  onToggleNotifications: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  mutedRoomIds: Set<string>;
  onToggleMuted: (roomIds: string[]) => void;
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
  notificationsSupported,
  notificationsEnabled,
  notificationsBlocked,
  onToggleNotifications,
  soundEnabled,
  onToggleSound,
  mutedRoomIds,
  onToggleMuted,
}: SidebarProps) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [themeMenuPosition, setThemeMenuPosition] = useState({ top: 0, right: 0 });
  const { theme } = useTheme();
  const { favoriteRoomIds, toggleFavorites } = useFavoriteRooms();

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

  const handleFavoriteSelected = () => {
    toggleFavorites(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleMuteSelected = () => {
    onToggleMuted(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const allSelectedAreFavorited = selectedIds.size > 0 && Array.from(selectedIds).every((roomId) => favoriteRoomIds.has(roomId));
  const allSelectedAreMuted = selectedIds.size > 0 && Array.from(selectedIds).every((roomId) => mutedRoomIds.has(roomId));

  const sortedRooms = [...rooms].sort((a, b) => Number(!favoriteRoomIds.has(a.id)) - Number(!favoriteRoomIds.has(b.id)));

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
        className="sidebar-header-bar"
        style={{
          background: theme.headerGradient,
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
              size={13}
              color="#4caf50"
              style={{
                position: 'absolute',
                bottom: '2px',
                right: '2px',
                background: 'white',
                borderRadius: '50%',
                padding: '2px',
                border: '2px solid white',
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
                {codeCopied && <FaCheck size={9} style={{ marginLeft: '2px' }} />}
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

          {notificationsSupported && (
            <button
              onClick={onToggleNotifications}
              disabled={notificationsBlocked}
              title={
                notificationsBlocked
                  ? 'Notificações bloqueadas nas configurações do navegador'
                  : notificationsEnabled
                    ? 'Desativar notificações'
                    : 'Ativar notificações'
              }
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
                cursor: notificationsBlocked ? 'not-allowed' : 'pointer',
                opacity: notificationsBlocked ? 0.5 : 1,
                flexShrink: 0,
              }}
              onMouseEnter={(event) => {
                if (!notificationsBlocked) {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                }
              }}
              onMouseLeave={(event) => {
                if (!notificationsBlocked) {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }
              }}
            >
              {notificationsEnabled ? <FaBell size={16} /> : <FaBellSlash size={16} />}
            </button>
          )}

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
          padding: '10px 12px',
          borderBottom: `1px solid ${theme.border}`,
          background: isSelectionMode ? theme.surfaceLight : theme.sidebarBg,
          flexShrink: 0,
          gap: '8px',
          minHeight: '48px',
          boxSizing: 'border-box',
          transition: 'background 0.15s ease',
        }}
      >
        {isSelectionMode ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={toggleSelectionMode}
                title="Fechar modo seleção"
                style={{
                  background: theme.surface,
                  border: 'none',
                  color: theme.text,
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <FaTimes size={13} />
              </button>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.text }}>
                {selectedIds.size > 0 ? `${selectedIds.size} selecionada${selectedIds.size > 1 ? 's' : ''}` : 'Selecionar conversas'}
              </span>
            </div>

            <button
              onClick={toggleSelectAll}
              title={selectedIds.size === rooms.length ? 'Desmarcar tudo' : 'Selecionar tudo'}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.text,
                width: '30px',
                height: '30px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {selectedIds.size === rooms.length ? <FaCheckSquare size={16} /> : <FaSquare size={16} />}
            </button>
          </>
        ) : (
          <>
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

            {rooms.length > 0 && (
              <button
                onClick={toggleSelectionMode}
                title="Entrar no modo seleção"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: `1.5px solid ${theme.border}`,
                  color: theme.text,
                  borderRadius: '999px',
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  event.currentTarget.style.borderColor = theme.primary;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  event.currentTarget.style.borderColor = theme.border;
                }}
              >
                <FaCheckCircle size={12} />
                Selecionar
              </button>
            )}
          </>
        )}
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
            {sortedRooms.map((room) => (
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
                typingUserIds={typingUserIds[room.id] ?? []}
                recordingUserIds={recordingUserIds[room.id] ?? []}
                isFavorite={favoriteRoomIds.has(room.id)}
                isMuted={mutedRoomIds.has(room.id)}
              />
            ))}
          </div>
        )}
      </div>

      {isSelectionMode && selectedIds.size > 0 && (
        <div
          className="animate__animated animate__fadeInUp animate__faster"
          style={{
            background: theme.surface,
            borderTop: `1px solid ${theme.border}`,
            boxShadow: '0 -4px 14px rgba(0, 0, 0, 0.12)',
            padding: '10px 12px',
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={handleFavoriteSelected}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              background: theme.surfaceLight,
              border: 'none',
              color: theme.text,
              borderRadius: '999px',
              padding: '5px 12px 5px 5px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.78rem',
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(251, 191, 36, 0.22)', color: '#fbbf24', flexShrink: 0 }}>
              <FaStar size={11} />
            </span>
            {allSelectedAreFavorited ? 'Desfavoritar' : 'Favoritar'}
          </button>
          <button
            onClick={handleMuteSelected}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              background: theme.surfaceLight,
              border: 'none',
              color: theme.text,
              borderRadius: '999px',
              padding: '5px 12px 5px 5px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.78rem',
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: `${theme.primary}26`, color: theme.primary, flexShrink: 0 }}>
              {allSelectedAreMuted ? <FaBell size={11} /> : <FaBellSlash size={11} />}
            </span>
            {allSelectedAreMuted ? 'Reativar' : 'Silenciar'}
          </button>
          <button
            onClick={() => setShowConfirmDelete(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              background: theme.surfaceLight,
              border: 'none',
              color: theme.text,
              borderRadius: '999px',
              padding: '5px 12px 5px 5px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.78rem',
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.16)', color: '#ef4444', flexShrink: 0 }}>
              <FaTrash size={11} />
            </span>
            Excluir
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={showConfirmDelete}
        title="Excluir Conversas"
        message={`Tem certeza que quer excluir ${selectedIds.size} conversa${selectedIds.size > 1 ? 's' : ''}? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
        onCancel={() => setShowConfirmDelete(false)}
        theme={theme}
      />

      <EditProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
      />
    </div>
  );
}
