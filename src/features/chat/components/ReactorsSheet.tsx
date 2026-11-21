import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FaTimes } from 'react-icons/fa';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { useBackdropDismiss } from '@hooks/useBackdropDismiss';
import { useBodyScrollLock } from '@hooks/useBodyScrollLock';
import { useEscapeKey } from '@hooks/useEscapeKey';
import type { MessageReaction, RoomParticipant } from '@lib/socket';
import { reactorName, summarizeReactions } from '../utils/reactions';

interface ReactorsSheetProps {
  isOpen: boolean;
  initialEmoji: string | null;
  reactions: readonly MessageReaction[] | undefined;
  participants: RoomParticipant[];
  currentUserId: string | undefined;
  onRemoveOwn: () => void;
  onClose: () => void;
}

interface SheetSnapshot {
  reactions: readonly MessageReaction[] | undefined;
  initialEmoji: string | null;
}

export function ReactorsSheet({ isOpen, initialEmoji, reactions, participants, currentUserId, onRemoveOwn, onClose }: ReactorsSheetProps) {
  const { t } = useTranslation();
  const { isPresent, isExiting } = usePresence(isOpen, MOTION_DURATION_MS.normal);
  const [filter, setFilter] = useState<string | null>(initialEmoji);
  const snapshotRef = useRef<SheetSnapshot>({ reactions, initialEmoji });
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const idPrefix = useId();
  const backdropDismiss = useBackdropDismiss(onClose);
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFilter(initialEmoji);
    closeButtonRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, initialEmoji]);

  if (isOpen) {
    snapshotRef.current = { reactions, initialEmoji };
  }

  const shownReactions = isOpen ? reactions : snapshotRef.current.reactions;
  const summaries = summarizeReactions(shownReactions, currentUserId);
  const activeFilter = filter && summaries.some((summary) => summary.emoji === filter) ? filter : null;
  const rows = (shownReactions ?? []).filter((reaction) => !activeFilter || reaction.emoji === activeFilter);

  useEffect(() => {
    if (isOpen && summaries.length === 0) {
      onClose();
    }
  }, [isOpen, summaries.length, onClose]);

  if (!isPresent) {
    return null;
  }

  const exitClass = isExiting ? ' is-exiting' : '';
  const tabFilters: (string | null)[] = [null, ...summaries.map((summary) => summary.emoji)];
  const activeIndex = Math.max(0, tabFilters.indexOf(activeFilter));
  const tabId = (index: number) => `${idPrefix}-tab-${index}`;
  const panelId = `${idPrefix}-panel`;

  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || !sheetRef.current) {
      return;
    }
    const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')].filter((element) => element.tabIndex >= 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const moveTab = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: activeIndex + 1,
      ArrowLeft: activeIndex - 1,
      Home: 0,
      End: tabFilters.length - 1,
    };
    const target = keys[event.key];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    const next = (target + tabFilters.length) % tabFilters.length;
    setFilter(tabFilters[next] ?? null);
    tabRefs.current[next]?.focus();
  };

  return createPortal(
    <div
      className={`sc-reactors-backdrop${exitClass}`}
      {...backdropDismiss}
      onPointerDown={(event) => {
        event.stopPropagation();
        backdropDismiss.onPointerDown(event);
      }}
    >
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('chat.reactions.sheetTitle')}
        className={`sc-reactors-sheet${exitClass}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={trapFocus}
      >
        <div className="sc-reactors-sheet__handle" aria-hidden="true" />
        <header className="sc-reactors-sheet__header">
          <h2>{t('chat.reactions.sheetTitle')}</h2>
          <button ref={closeButtonRef} type="button" className="sc-reactors-sheet__close" aria-label={t('chat.reactions.close')} onClick={onClose}>
            <FaTimes size={14} aria-hidden="true" />
          </button>
        </header>

        <div className="sc-reactors-sheet__tabs" role="tablist" aria-label={t('chat.reactions.sheetTitle')} onKeyDown={moveTab}>
          {tabFilters.map((tabFilter, index) => {
            const summary = summaries.find((entry) => entry.emoji === tabFilter);
            const isActive = index === activeIndex;
            return (
              <button
                key={tabFilter ?? 'all'}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                id={tabId(index)}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                aria-label={summary ? `${summary.emoji} ${summary.count}` : undefined}
                tabIndex={isActive ? 0 : -1}
                className="sc-reactors-tab"
                onClick={() => setFilter(tabFilter)}
              >
                {summary ? (
                  <>
                    <span aria-hidden="true">{summary.emoji}</span> <span className="sc-reactors-tab__count">{summary.count}</span>
                  </>
                ) : (
                  <>
                    {t('chat.reactions.all')} <span className="sc-reactors-tab__count">{shownReactions?.length ?? 0}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div className="sc-reactors-sheet__list" id={panelId} role="tabpanel" aria-labelledby={tabId(activeIndex)}>
          <ul>
            {rows.map((reaction, index) => {
              const isMine = reaction.userId === currentUserId;
              const participant = participants.find((entry) => entry.id === reaction.userId);
              const content = (
                <>
                  <Avatar userId={reaction.userId} avatarIndex={participant?.avatar} tone="soft" size={38} iconSize={18} />
                  <span className="sc-reactors-row__name">
                    {reactorName(reaction.userId, participants, currentUserId)}
                    {isMine && <small>{t('chat.reactions.tapToRemove')}</small>}
                  </span>
                  <span className="sc-reactors-row__emoji" aria-hidden="true">
                    {reaction.emoji}
                  </span>
                </>
              );
              return (
                <li key={`${reaction.userId}:${reaction.emoji}:${index}`}>
                  {isMine ? (
                    <button
                      type="button"
                      className="sc-reactors-row"
                      aria-label={t('chat.reactions.removeReaction', { emoji: reaction.emoji })}
                      onClick={() => {
                        onRemoveOwn();
                        onClose();
                      }}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="sc-reactors-row">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>,
    document.body,
  );
}
