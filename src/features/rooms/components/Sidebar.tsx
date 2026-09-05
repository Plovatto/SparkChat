import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from 'react';
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
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { IconPillButton } from '@components/common/IconPillButton';
import type { User } from '@features/auth';
import { AVATARS, AVATAR_ICON_COLOR } from '@features/auth/constants/avatars';
import { STATUS_TEXT_MAX_LENGTH } from '@features/auth/constants/validation';
import { isAssistantRoom } from '@features/chat/utils/assistant';
import { useTheme } from '@features/theme';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import { useSocket, type RoomSummary } from '@lib/socket';
import { useFavoriteRooms } from '../hooks/useFavoriteRooms';
import { EditProfileModal } from './EditProfileModal';
import { RoomListItem } from './RoomListItem';
import { ThemeMenu } from './ThemeMenu';

function getRoomLastActivityTimestamp(room: RoomSummary): number {
  return room.lastMessage ? new Date(room.lastMessage.timestamp).getTime() : 0;
}

interface HeaderIconButtonProps {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  disabled?: boolean;
  children: ReactNode;
}

function HeaderIconButton({ onClick, title, disabled = false, children }: HeaderIconButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="sc-icon-btn sc-icon-btn--header" style={{ width: '38px', height: '38px' }}>
      {children}
    </button>
  );
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
  const clipboard = useClipboardCopy();
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
    if (roomId === assistantRoomId) {
      return;
    }
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

  const selectableRooms = rooms.filter((room) => !isAssistantRoom(room));

  const toggleSelectAll = () => {
    setSelectedIds((previous) => (previous.size === selectableRooms.length ? new Set() : new Set(selectableRooms.map((room) => room.id))));
  };

  const exitSelectionMode = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const confirmDelete = () => {
    onDeleteRooms(Array.from(selectedIds));
    exitSelectionMode();
  };

  const assistantRoomId = rooms.find(isAssistantRoom)?.id;
  const favoritableSelectedIds = Array.from(selectedIds).filter((roomId) => roomId !== assistantRoomId);

  const handleFavoriteSelected = () => {
    toggleFavorites(favoritableSelectedIds);
    exitSelectionMode();
  };

  const handleMuteSelected = () => {
    onToggleMuted(Array.from(selectedIds));
    exitSelectionMode();
  };

  const allSelectedAreFavorited =
    favoritableSelectedIds.length > 0 && favoritableSelectedIds.every((roomId) => favoriteRoomIds.has(roomId));
  const allSelectedAreMuted = selectedIds.size > 0 && Array.from(selectedIds).every((roomId) => mutedRoomIds.has(roomId));

  const sortedRooms = [...rooms].sort((a, b) => {
    const assistantDiff = Number(!isAssistantRoom(a)) - Number(!isAssistantRoom(b));
    if (assistantDiff !== 0) {
      return assistantDiff;
    }
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
    <div style={{ height: '100%', background: theme.sidebar, display: 'flex', flexDirection: 'column' }}>
      <div
        className="sidebar-header-bar"
        style={{
          background: theme.gradient,
          color: theme.onGradient,
          boxShadow: theme.shadowMd,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
          <div
            onClick={() => setIsProfileOpen(true)}
            className="sc-header-avatar"
            style={{
              position: 'relative',
              width: '55px',
              height: '55px',
              background: avatar?.bgGradient ?? theme.gradient,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: theme.shadowSm,
              flexShrink: 0,
            }}
            title="Clique para editar perfil"
          >
            {avatar ? <avatar.icon size={28} color={AVATAR_ICON_COLOR} /> : null}
            <FaCircle
              size={13}
              color={theme.online}
              style={{
                position: 'absolute',
                bottom: '2px',
                right: '2px',
                background: theme.surfaceElevated,
                borderRadius: '50%',
                padding: '2px',
                border: `2px solid ${theme.surfaceElevated}`,
                boxShadow: theme.shadowSm,
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
                onClick={() => clipboard.copy(user.nickname)}
                title="Copiar username"
                className="sc-icon-btn sc-icon-btn--header"
                style={{ width: '17px', height: '17px', borderRadius: '5px', alignSelf: 'center', position: 'relative', top: '2px' }}
              >
                {clipboard.isCopied() ? <FaCheck size={9} /> : <FaCopy size={9} />}
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
                className="sc-input sc-input--header"
                style={{
                  marginTop: '3px',
                  marginLeft: '-6px',
                  width: 'calc(100% + 6px)',
                  maxWidth: '226px',
                  lineHeight: 1.3,
                }}
              />
            ) : (
              <div
                onClick={handleStartEditStatus}
                title="Clique para editar seu status"
                className="sc-header-status"
                style={{
                  marginTop: '3px',
                  marginLeft: '-6px',
                  padding: '2px 6px',
                  lineHeight: 1.3,
                  fontSize: '0.78rem',
                  color: user.statusText ? theme.onGradient : theme.onGradientMuted,
                  fontStyle: user.statusText ? 'normal' : 'italic',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.statusText || 'Adicionar status'}
              </div>
            )}
          </div>

          <HeaderIconButton onClick={handleThemeButtonClick} title="Temas">
            <FaPalette size={16} />
          </HeaderIconButton>

          <ThemeMenu isOpen={showThemeMenu} position={themeMenuPosition} onClose={() => setShowThemeMenu(false)} />

          {notificationsSupported && (
            <HeaderIconButton
              onClick={onToggleNotifications}
              disabled={notificationsBlocked}
              title={
                notificationsBlocked
                  ? 'Notificações bloqueadas nas configurações do navegador'
                  : notificationsEnabled
                    ? 'Desativar notificações'
                    : 'Ativar notificações'
              }
            >
              {notificationsEnabled ? <FaBell size={16} /> : <FaBellSlash size={16} />}
            </HeaderIconButton>
          )}

          <HeaderIconButton onClick={onLogout} title="Sair">
            <FaSignOutAlt size={16} />
          </HeaderIconButton>
        </div>

        <button
          className="sc-btn sc-btn--header animate__animated animate__pulse"
          onClick={onNewChat}
          style={{ width: '100%', padding: '11px', borderRadius: '10px' }}
        >
          <FaPlus size={14} /> Novo Chat
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: `1px solid ${theme.borderSubtle}`,
          background: isSelectionMode ? theme.surfaceSelected : theme.sidebar,
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
                className="sc-icon-btn sc-icon-btn--ghost"
                style={{ width: '30px', height: '30px', color: theme.textPrimary }}
              >
                <FaTimes size={13} />
              </button>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.textPrimary }}>
                {selectedIds.size > 0 ? `${selectedIds.size} selecionada${selectedIds.size > 1 ? 's' : ''}` : 'Selecionar conversas'}
              </span>
            </div>

            <button
              onClick={toggleSelectAll}
              title={selectedIds.size === rooms.length ? 'Desmarcar tudo' : 'Selecionar tudo'}
              className="sc-icon-btn sc-icon-btn--ghost"
              style={{ width: '30px', height: '30px', color: selectedIds.size === rooms.length ? theme.accentText : theme.textPrimary }}
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
                className="sc-btn sc-btn--ghost-border"
                style={{ borderRadius: '999px', padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, gap: '6px' }}
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
            <p style={{ fontSize: '0.85rem', margin: '5px 0', color: theme.textMuted }}>Clique em &quot;Novo Chat&quot;</p>
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
                isSelectionMode={isSelectionMode && !isAssistantRoom(room)}
                isChecked={selectedIds.has(room.id)}
                onToggleSelect={() => toggleRoomSelected(room.id)}
                typingUserIds={typingUserIds[room.id] ?? []}
                recordingUserIds={recordingUserIds[room.id] ?? []}
                isFavorite={!isAssistantRoom(room) && favoriteRoomIds.has(room.id)}
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
            background: theme.sidebar,
            borderTop: `1px solid ${theme.border}`,
            boxShadow: theme.shadowMd,
            padding: '10px 12px',
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
          }}
        >
          {favoritableSelectedIds.length > 0 && (
            <IconPillButton
              onClick={handleFavoriteSelected}
              fontSize="0.78rem"
              gap="7px"
              paddingRight="12px"
              withShadow={false}
              icon={<FaStar size={11} />}
              tone="warning"
              label={allSelectedAreFavorited ? 'Desfavoritar' : 'Favoritar'}
            />
          )}
          <IconPillButton
            onClick={handleMuteSelected}
            fontSize="0.78rem"
            gap="7px"
            paddingRight="12px"
            withShadow={false}
            icon={allSelectedAreMuted ? <FaBell size={11} /> : <FaBellSlash size={11} />}
            tone="accent"
            label={allSelectedAreMuted ? 'Reativar' : 'Silenciar'}
          />
          <IconPillButton
            onClick={() => setShowConfirmDelete(true)}
            fontSize="0.78rem"
            gap="7px"
            paddingRight="12px"
            withShadow={false}
            icon={<FaTrash size={11} />}
            tone="danger"
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
