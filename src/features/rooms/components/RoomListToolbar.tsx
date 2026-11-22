import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaTimes } from 'react-icons/fa';
import { LuSearch, LuSquareCheck } from 'react-icons/lu';
import { ROOM_FILTERS, type RoomFilter } from '../utils/room-filters';
import '../styles/room-list-toolbar.css';

const MAX_BADGE_COUNT = 99;

interface RoomListToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  filter: RoomFilter;
  onFilterChange: (filter: RoomFilter) => void;
  unreadCount: number;
  canSelect: boolean;
  onEnterSelection: () => void;
  selectionBar?: ReactNode;
}

export function RoomListToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  unreadCount,
  canSelect,
  onEnterSelection,
  selectionBar,
}: RoomListToolbarProps) {
  const { t } = useTranslation();
  const filterLabels: Record<RoomFilter, string> = {
    all: t('sidebar.filters.all'),
    unread: t('sidebar.filters.unread'),
    groups: t('sidebar.filters.groups'),
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && query) {
      event.stopPropagation();
      onQueryChange('');
    }
  };

  return (
    <div className="sc-room-toolbar" data-selecting={selectionBar ? 'true' : 'false'}>
      <label className="sc-room-search">
        <LuSearch className="sc-room-search__icon" aria-hidden="true" strokeWidth={2.2} />
        <input
          type="search"
          className="sc-room-search__input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder={t('sidebar.searchPlaceholder')}
          aria-label={t('sidebar.searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button type="button" className="sc-room-search__clear" onClick={() => onQueryChange('')} aria-label={t('sidebar.clearSearch')} title={t('sidebar.clearSearch')}>
            <FaTimes aria-hidden="true" />
          </button>
        )}
      </label>

      {selectionBar ?? (
        <div className="sc-room-filters sc-anim-swap-in-left">
          <div className="sc-room-filters__chips" role="group" aria-label={t('sidebar.filters.label')}>
            {ROOM_FILTERS.map((id) => (
              <button
                key={id}
                type="button"
                className="sc-room-chip"
                data-active={filter === id ? 'true' : 'false'}
                aria-pressed={filter === id}
                onClick={() => onFilterChange(id)}
              >
                {filterLabels[id]}
                {id === 'unread' && unreadCount > 0 && (
                  <span key={unreadCount} className="sc-room-chip__badge sc-anim-badge-pop" aria-label={t('sidebar.filters.unreadCount', { count: unreadCount })}>
                    {unreadCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          {canSelect && (
            <button type="button" className="sc-room-select" onClick={onEnterSelection} title={t('sidebar.enterSelection')} aria-label={t('sidebar.enterSelection')}>
              <LuSquareCheck aria-hidden="true" strokeWidth={2.1} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
