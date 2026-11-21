import { useEffect, useRef, useState } from 'react';
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
  const backdropDismiss = useBackdropDismiss(onClose);
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setFilter(initialEmoji);
      closeButtonRef.current?.focus();
    }
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
        role="dialog"
        aria-modal="true"
        aria-label={t('chat.reactions.sheetTitle')}
        className={`sc-reactors-sheet${exitClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sc-reactors-sheet__handle" aria-hidden="true" />
        <header className="sc-reactors-sheet__header">
          <h2>{t('chat.reactions.sheetTitle')}</h2>
          <button ref={closeButtonRef} type="button" className="sc-reactors-sheet__close" aria-label={t('chat.reactions.close')} onClick={onClose}>
            <FaTimes size={14} aria-hidden="true" />
          </button>
        </header>

        <div className="sc-reactors-sheet__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={activeFilter === null} className="sc-reactors-tab" onClick={() => setFilter(null)}>
            {t('chat.reactions.all')} <span className="sc-reactors-tab__count">{shownReactions?.length ?? 0}</span>
          </button>
          {summaries.map((summary) => (
            <button
              key={summary.emoji}
              type="button"
              role="tab"
              aria-selected={activeFilter === summary.emoji}
              className="sc-reactors-tab"
              onClick={() => setFilter(summary.emoji)}
            >
              <span aria-hidden="true">{summary.emoji}</span> <span className="sc-reactors-tab__count">{summary.count}</span>
            </button>
          ))}
        </div>

        <ul className="sc-reactors-sheet__list">
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
      </section>
    </div>,
    document.body,
  );
}
