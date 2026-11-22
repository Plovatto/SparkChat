import { useCallback, useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FaBell,
  FaBellSlash,
  FaCheck,
  FaCheckSquare,
  FaCircle,
  FaComments,
  FaCopy,
  FaPalette,
  FaPlus,
  FaSearch,
  FaSignOutAlt,
  FaSquare,
  FaStar,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { IconPillButton } from '@components/common/IconPillButton';
import type { User } from '@features/auth';
import { AVATARS } from '@features/auth/constants/avatars';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { STATUS_TEXT_MAX_LENGTH } from '@features/auth/constants/validation';
import { IncomingCallSlot } from '@features/calls';
import { isAssistantRoom } from '@features/chat/utils/assistant';
import { useLatchedPresence } from '@features/motion';
import { useTheme } from '@features/theme';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import { useEscapeKey } from '@hooks/useEscapeKey';
import { useSocket, type RoomSummary } from '@lib/socket';
import { InstallAppButton } from '@features/pwa/components/InstallAppButton';
import { useFavoriteRooms } from '../hooks/useFavoriteRooms';
import { EditProfileModal } from './EditProfileModal';
import { countUnreadRooms, filterRooms, type RoomFilter } from '../utils/room-filters';
import { RoomListItem } from './RoomListItem';
import { RoomListToolbar } from './RoomListToolbar';
import { ThemeMenu } from './ThemeMenu';

const ROOM_CASCADE_MAX_INDEX = 8;
const EMPTY_USER_IDS: string[] = [];

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
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className="sc-icon-btn sc-icon-btn--header sidebar-header-btn">
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
  notificationContentHidden: boolean;
  onToggleNotificationContent: () => void;
  mutedRoomIds: Set<string>;
  onToggleMuted: (roomIds: string[]) => void;
  listHeader?: ReactNode;
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
  notificationContentHidden,
  onToggleNotificationContent,
  mutedRoomIds,
  onToggleMuted,
  listHeader,
}: SidebarProps) {
  const { t } = useTranslation();
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
  const { favoriteRoomIds, toggleFavorites } = useFavoriteRooms(user.id);

  const handleThemeButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setThemeMenuPosition({ top: rect.bottom + 10, right: window.innerWidth - rect.right });
    setShowThemeMenu(true);
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode((previous) => !previous);
    setSelectedIds(new Set());
  };

  const assistantRoomId = useMemo(() => rooms.find(isAssistantRoom)?.id, [rooms]);

  const toggleRoomSelected = useCallback(
    (roomId: string) => {
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
    },
    [assistantRoomId],
  );

  const openRoomOptions = useCallback(
    (roomId: string): boolean => {
      if (roomId === assistantRoomId) {
        return false;
      }
      setIsSelectionMode(true);
      setSelectedIds((previous) => (previous.has(roomId) ? previous : new Set([...previous, roomId])));
      return true;
    },
    [assistantRoomId],
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('all');
  const unreadRoomCount = useMemo(() => countUnreadRooms(rooms), [rooms]);
  const selectableRooms = rooms.filter((room) => !isAssistantRoom(room));
  const allSelectableSelected = selectableRooms.length > 0 && selectedIds.size === selectableRooms.length;

  const toggleSelectAll = () => {
    setSelectedIds((previous) => (previous.size === selectableRooms.length ? new Set() : new Set(selectableRooms.map((room) => room.id))));
  };

  const exitSelectionMode = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const exitSelectionModeOnEscape = useCallback(() => {
    if (document.querySelector('.sc-modal-backdrop')) {
      return;
    }
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  }, []);
  useEscapeKey(isSelectionMode, exitSelectionModeOnEscape);

  const confirmDelete = () => {
    onDeleteRooms(Array.from(selectedIds));
    exitSelectionMode();
  };

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
  const hasSelectionBar = isSelectionMode && selectedIds.size > 0;
  const canFavoriteSelection = favoritableSelectedIds.length > 0;
  const selectionBarActions = useMemo(
    () =>
      hasSelectionBar
        ? { canFavorite: canFavoriteSelection, allFavorited: allSelectedAreFavorited, allMuted: allSelectedAreMuted }
        : null,
    [hasSelectionBar, canFavoriteSelection, allSelectedAreFavorited, allSelectedAreMuted],
  );
  const selectionBarPresence = useLatchedPresence(selectionBarActions);
  const showFavoriteAction = selectionBarPresence.value?.canFavorite ?? false;
  const favoriteActionUndoes = selectionBarPresence.value?.allFavorited ?? false;
  const muteActionUndoes = selectionBarPresence.value?.allMuted ?? false;

  const sortedRooms = useMemo(
    () =>
      [...rooms].sort((a, b) => {
        const assistantDiff = Number(!isAssistantRoom(a)) - Number(!isAssistantRoom(b));
        if (assistantDiff !== 0) {
          return assistantDiff;
        }
        const favoriteDiff = Number(!favoriteRoomIds.has(a.id)) - Number(!favoriteRoomIds.has(b.id));
        if (favoriteDiff !== 0) {
          return favoriteDiff;
        }
        return getRoomLastActivityTimestamp(b) - getRoomLastActivityTimestamp(a);
      }),
    [rooms, favoriteRoomIds],
  );

  const visibleRooms = useMemo(() => filterRooms(sortedRooms, roomFilter, searchQuery, user.id), [sortedRooms, roomFilter, searchQuery, user.id]);

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

      if (isEditable || visibleRooms.length === 0) {
        return;
      }

      event.preventDefault();
      const currentIndex = visibleRooms.findIndex((room) => room.id === selectedRoomId);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + delta + visibleRooms.length) % visibleRooms.length;
      const nextRoom = visibleRooms[nextIndex];
      if (nextRoom) {
        onSelectRoom(nextRoom);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visibleRooms, selectedRoomId, onSelectRoom]);

  const hasPresetAvatar = AVATARS[user.avatar] !== undefined;

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
          <Avatar
            userId={user.id}
            avatarIndex={user.avatar}
            background={hasPresetAvatar ? undefined : theme.gradient}
            size={55}
            iconSize={28}
            onClick={() => setIsProfileOpen(true)}
            className="sc-header-avatar"
            style={{ boxShadow: theme.shadowSm }}
            title={t('sidebar.editProfile')}
          >
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
          </Avatar>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
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
                title={t('roomInfo.copyUsername')}
                className="sc-icon-btn sc-icon-btn--header"
                style={{ width: '17px', height: '17px', borderRadius: '5px', alignSelf: 'center', position: 'relative', top: '2px' }}
              >
                {clipboard.isCopied() ? <FaCheck size={9} className="sc-anim-badge-pop" /> : <FaCopy size={9} />}
              </button>
            </div>

            {isEditingStatus ? (
              <input
                type="text"
                autoFocus
                value={statusDraft}
                maxLength={STATUS_TEXT_MAX_LENGTH}
                placeholder={t('sidebar.statusPlaceholder')}
                onChange={(event) => setStatusDraft(event.target.value)}
                onBlur={commitStatusDraft}
                onKeyDown={handleStatusInputKeyDown}
                className="sc-input sc-input--header sc-anim-fade-in"
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
                title={t('sidebar.editStatus')}
                className="sc-header-status sc-anim-fade-in"
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
                {user.statusText || t('sidebar.addStatus')}
              </div>
            )}
          </div>

          <div className="sidebar-header-actions">
            <HeaderIconButton onClick={handleThemeButtonClick} title={t('sidebar.themes')}>
              <FaPalette size={16} />
            </HeaderIconButton>

            <ThemeMenu isOpen={showThemeMenu} position={themeMenuPosition} onClose={() => setShowThemeMenu(false)} />

            {notificationsSupported && (
              <HeaderIconButton
                onClick={onToggleNotifications}
                disabled={notificationsBlocked}
                title={
                  notificationsBlocked
                    ? t('sidebar.notificationsBlocked')
                    : notificationsEnabled
                      ? t('sidebar.disableNotifications')
                      : t('sidebar.enableNotifications')
                }
              >
                {notificationsEnabled ? <FaBell size={16} /> : <FaBellSlash size={16} />}
              </HeaderIconButton>
            )}

            <InstallAppButton />

            <HeaderIconButton onClick={onLogout} title={t('sidebar.logout')}>
              <FaSignOutAlt size={16} />
            </HeaderIconButton>
          </div>
        </div>

        <button
          className="sc-btn sc-btn--header sc-anim-attention"
          onClick={onNewChat}
          style={{ width: '100%', padding: '11px', borderRadius: '10px' }}
        >
          <FaPlus size={14} /> {t('sidebar.newChat')}
        </button>
      </div>

      <RoomListToolbar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        filter={roomFilter}
        onFilterChange={setRoomFilter}
        unreadCount={unreadRoomCount}
        canSelect={selectableRooms.length > 0}
        onEnterSelection={toggleSelectionMode}
        selectionBar={
          isSelectionMode ? (
            <div className="sc-room-selection">
              <div className="sc-anim-swap-in-left" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={toggleSelectionMode}
                  title={t('sidebar.closeSelection')}
                  className="sc-icon-btn sc-icon-btn--ghost"
                  style={{ width: '30px', height: '30px', color: theme.textPrimary }}
                >
                  <FaTimes size={13} />
                </button>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.textPrimary }}>
                  {selectedIds.size > 0 ? t('sidebar.selected', { count: selectedIds.size }) : t('sidebar.selectConversations')}
                </span>
              </div>

              <button
                onClick={toggleSelectAll}
                title={allSelectableSelected ? t('sidebar.unselectAll') : t('sidebar.selectAll')}
                className="sc-icon-btn sc-icon-btn--ghost sc-anim-swap-in-right"
                style={{ width: '30px', height: '30px', color: allSelectableSelected ? theme.accentText : theme.borderStrong }}
              >
                {allSelectableSelected ? <FaCheckSquare size={18} /> : <FaSquare size={18} />}
              </button>
            </div>
          ) : undefined
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        {listHeader}
        {rooms.length > 0 && visibleRooms.length === 0 ? (
          <div className="sc-room-empty-search sc-anim-rise-in">
            <FaSearch className="sc-room-empty-search__icon" aria-hidden="true" />
            <p style={{ fontSize: '0.92rem', margin: '0 0 4px', color: theme.textPrimary, fontWeight: 600 }}>{t('sidebar.noResults')}</p>
            <p style={{ fontSize: '0.84rem', margin: 0, color: theme.textMuted }}>{t('sidebar.noResultsHint')}</p>
          </div>
        ) : rooms.length === 0 ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: theme.textSecondary }}>
            <FaComments size={50} className="animate-float" style={{ opacity: 0.3, marginBottom: '15px' }} />
            <p className="sc-anim-rise-in sc-stagger" style={{ fontSize: '0.9rem', margin: '5px 0', '--sc-stagger-index': 1 } as CSSProperties}>
              {t('sidebar.noConversations')}
            </p>
            <p
              className="sc-anim-rise-in sc-stagger"
              style={{ fontSize: '0.85rem', margin: '5px 0', color: theme.textMuted, '--sc-stagger-index': 2 } as CSSProperties}
            >
              {t('sidebar.emptyHint')}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {visibleRooms.map((room, index) => (
              <RoomListItem
                key={room.id}
                entranceIndex={Math.min(index, ROOM_CASCADE_MAX_INDEX)}
                room={room}
                user={user}
                isSelected={room.id === selectedRoomId}
                onSelect={onSelectRoom}
                isSelectionMode={isSelectionMode && !isAssistantRoom(room)}
                isChecked={selectedIds.has(room.id)}
                onToggleSelect={toggleRoomSelected}
                typingUserIds={typingUserIds[room.id] ?? EMPTY_USER_IDS}
                recordingUserIds={recordingUserIds[room.id] ?? EMPTY_USER_IDS}
                isFavorite={!isAssistantRoom(room) && favoriteRoomIds.has(room.id)}
                isMuted={mutedRoomIds.has(room.id)}
                onOpenOptions={openRoomOptions}
              />
            ))}
          </div>
        )}
      </div>

      <IncomingCallSlot />

      {selectionBarPresence.isPresent && (
        <div
          className={selectionBarPresence.isExiting ? 'sc-anim-rise-out' : 'sc-anim-rise-in'}
          inert={selectionBarPresence.isExiting}
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
          {showFavoriteAction && (
            <IconPillButton
              onClick={handleFavoriteSelected}
              fontSize="0.78rem"
              gap="7px"
              paddingRight="12px"
              withShadow={false}
              icon={<FaStar size={11} />}
              tone="warning"
              label={favoriteActionUndoes ? t('sidebar.unfavorite') : t('sidebar.favorite')}
            />
          )}
          <IconPillButton
            onClick={handleMuteSelected}
            fontSize="0.78rem"
            gap="7px"
            paddingRight="12px"
            withShadow={false}
            icon={muteActionUndoes ? <FaBell size={11} /> : <FaBellSlash size={11} />}
            tone="accent"
            label={muteActionUndoes ? t('sidebar.unmute') : t('sidebar.mute')}
          />
          <IconPillButton
            onClick={() => setShowConfirmDelete(true)}
            fontSize="0.78rem"
            gap="7px"
            paddingRight="12px"
            withShadow={false}
            icon={<FaTrash size={11} />}
            tone="danger"
            label={t('common.delete')}
          />
        </div>
      )}

      <ConfirmDialog
        isOpen={showConfirmDelete}
        title={t('sidebar.deleteTitle')}
        message={t('sidebar.deleteConfirm', { count: selectedIds.size })}
        confirmLabel={t('common.delete')}
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
        notificationContentHidden={notificationContentHidden}
        onToggleNotificationContent={onToggleNotificationContent}
      />
    </div>
  );
}
