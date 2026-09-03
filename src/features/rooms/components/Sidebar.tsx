import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
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
import { IconPillButton } from '@components/common/IconPillButton';
import { useTheme } from '@features/theme';
import { useSocket } from '@lib/socket';
import { useFavoriteRooms } from '../hooks/useFavoriteRooms';
import type { RoomSummary } from '../types';
import { EditProfileModal } from './EditProfileModal';
import { RoomListItem } from './RoomListItem';
import { ThemeMenu } from './ThemeMenu';

const STATUS_TEXT_MAX_LENGTH = 30;

function getRoomLastActivityTimestamp(room: RoomSummary): number {
  return room.lastMessage ? new Date(room.lastMessage.timestamp).getTime() : 0;
}

interface SidebarProps {
  user: User;
  onUserUpdate: (patch: Partial<User>) => void;
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
  onUserUpdate,
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
  const [usernameCopied, setUsernameCopied] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [themeMenuPosition, setThemeMenuPosition] = useState({ top: 0, right: 0 });
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState(user.statusText ?? '');
  const { theme } = useTheme();
  const { socket } = useSocket();
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

  const sortedRooms = [...rooms].sort((a, b) => {
    const favoriteDiff = Number(!favoriteRoomIds.has(a.id)) - Number(!favoriteRoomIds.has(b.id));
    if (favoriteDiff !== 0) {
      return favoriteDiff;
    }
    return getRoomLastActivityTimestamp(b) - getRoomLastActivityTimestamp(a);
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return;
      }

      const activeElement = document.activeElement;
      const isEditable =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable);

      if (isEditable || sortedRooms.length === 0) {
        return;
      }

      event.preventDefault();
      const currentIndex = sortedRooms.findIndex((room) => room.id === selectedRoomId);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + delta + sortedRooms.length) % sortedRooms.length;
      const nextRoom = sortedRooms[nextIndex];
      if (nextRoom) {
        onSelectRoom(nextRoom);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sortedRooms, selectedRoomId, onSelectRoom]);

  const avatar = AVATARS[user.avatar];

  const copyUsername = () => {
    if (!navigator.clipboard) {
      return;
    }

    navigator.clipboard
      .writeText(user.nickname)
      .then(() => {
        setUsernameCopied(true);
        setTimeout(() => setUsernameCopied(false), 2000);
      })
      .catch(() => {
        setUsernameCopied(false);
      });
  };

  const handleStartEditStatus = () => {
    setStatusDraft(user.statusText ?? '');
    setIsEditingStatus(true);
  };

  const commitStatusDraft = () => {
    const trimmed = statusDraft.trim().slice(0, STATUS_TEXT_MAX_LENGTH);
    setIsEditingStatus(false);

    if (trimmed === (user.statusText ?? '')) {
      return;
    }

    socket?.emit('user:update-status-text', { statusText: trimmed });
    onUserUpdate({ statusText: trimmed.length > 0 ? trimmed : null });
  };

  const handleStatusInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setStatusDraft(user.statusText ?? '');
      setIsEditingStatus(false);
    }
  };

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <h5
                style={{
                  margin: 0,
                  lineHeight: 1,
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.nickname}
              </h5>
              <button
                onClick={copyUsername}
                title="Copiar username"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: theme.headerTextColor,
                  width: '17px',
                  height: '17px',
                  borderRadius: '5px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  alignSelf: 'center',
                  position: 'relative',
                  top: '2px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.35)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
              >
                {usernameCopied ? <FaCheck size={9} /> : <FaCopy size={9} />}
              </button>
            </div>

            {isEditingStatus ? (
              <input
                type="text"
                autoFocus
                value={statusDraft}
                maxLength={STATUS_TEXT_MAX_LENGTH}
                placeholder="Ex: no trampo, 🎮 jogando"
                onChange={(event) => setStatusDraft(event.target.value)}
                onBlur={commitStatusDraft}
                onKeyDown={handleStatusInputKeyDown}
                style={{
                  marginTop: '3px',
                  marginLeft: '-6px',
                  width: 'calc(100% + 6px)',
                  maxWidth: '226px',
                  boxSizing: 'border-box',
                  lineHeight: 1.3,
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '2px 6px',
                  color: theme.headerTextColor,
                  fontSize: '0.78rem',
                  outline: 'none',
                }}
              />
            ) : (
              <div
                onClick={handleStartEditStatus}
                title="Clique para editar seu status"
                style={{
                  marginTop: '3px',
                  marginLeft: '-6px',
                  padding: '2px 6px',
                  borderRadius: '5px',
                  lineHeight: 1.3,
                  fontSize: '0.78rem',
                  opacity: user.statusText ? 0.9 : 0.6,
                  fontStyle: user.statusText ? 'normal' : 'italic',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.statusText || 'Adicionar status'}
              </div>
            )}
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
          <IconPillButton
            onClick={handleFavoriteSelected}
            background={theme.surfaceLight}
            textColor={theme.text}
            fontSize="0.78rem"
            gap="7px"
            paddingRight="12px"
            withShadow={false}
            icon={<FaStar size={11} />}
            iconBackground="rgba(251, 191, 36, 0.22)"
            iconColor="#fbbf24"
            label={allSelectedAreFavorited ? 'Desfavoritar' : 'Favoritar'}
          />
          <IconPillButton
            onClick={handleMuteSelected}
            background={theme.surfaceLight}
            textColor={theme.text}
            fontSize="0.78rem"
            gap="7px"
            paddingRight="12px"
            withShadow={false}
            icon={allSelectedAreMuted ? <FaBell size={11} /> : <FaBellSlash size={11} />}
            iconBackground={`${theme.primary}26`}
            iconColor={theme.primary}
            label={allSelectedAreMuted ? 'Reativar' : 'Silenciar'}
          />
          <IconPillButton
            onClick={() => setShowConfirmDelete(true)}
            background={theme.surfaceLight}
            textColor={theme.text}
            fontSize="0.78rem"
            gap="7px"
            paddingRight="12px"
            withShadow={false}
            icon={<FaTrash size={11} />}
            iconBackground="rgba(239, 68, 68, 0.16)"
            iconColor="#ef4444"
            label="Excluir"
          />
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
        onUserUpdate={onUserUpdate}
        onLogout={onLogout}
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
      />
    </div>
  );
}
