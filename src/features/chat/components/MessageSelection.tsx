import { useEffect, useState, type ReactNode } from 'react';
import { MOTION_DURATION_MS } from '@features/motion';
import { useTranslation } from 'react-i18next';
import { FaCheck, FaTimes, FaTrash } from 'react-icons/fa';
import '../styles/delete-messages.css';

interface SelectableMessageRowProps {
  isOwn: boolean;
  isSelecting: boolean;
  isSelectable: boolean;
  isChecked: boolean;
  isExiting: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function SelectableMessageRow({ isOwn, isSelecting, isSelectable, isChecked, isExiting, onToggle, children }: SelectableMessageRowProps) {
  const { t } = useTranslation();
  const className = `sc-message-row${isExiting ? ' is-exiting' : ''}${isSelectable ? ' is-selecting' : ''}`;

  return (
    <div
      className={className}
      data-checked={isChecked}
      role={isSelectable ? 'checkbox' : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      aria-checked={isSelectable ? isChecked : undefined}
      aria-label={isSelectable ? t('chat.selection.toggle') : undefined}
      onClick={
        isSelectable
          ? (event) => {
              event.stopPropagation();
              onToggle();
            }
          : undefined
      }
      onKeyDown={
        isSelectable
          ? (event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                onToggle();
              }
            }
          : undefined
      }
    >
      <div className="sc-message-row__inner">
        {isSelectable && (
          <span className="sc-select-check" aria-hidden="true">
            {isChecked && <FaCheck size={10} />}
          </span>
        )}
        <div
          inert={isSelecting}
          data-testid="message-row-content"
          style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

interface SelectionBarProps {
  count: number;
  onCancel: () => void;
  onDelete: () => void;
}

export function SelectionBar({ count, onCancel, onDelete }: SelectionBarProps) {
  const { t } = useTranslation();

  return (
    <div className="sc-selection-bar" role="toolbar" aria-label={t('chat.selection.count', { count })}>
      <button
        type="button"
        onClick={onCancel}
        className="sc-icon-btn sc-icon-btn--surface"
        aria-label={t('chat.selection.cancel')}
        title={t('chat.selection.cancel')}
        style={{ width: '44px', height: '44px', flexShrink: 0 }}
      >
        <FaTimes size={16} />
      </button>
      <span className="sc-selection-bar__count" aria-live="polite">
        {t('chat.selection.count', { count })}
      </span>
      <button
        type="button"
        className="sc-selection-bar__delete"
        disabled={count === 0}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <FaTrash size={13} aria-hidden="true" />
        {t('chat.selection.delete')}
      </button>
    </div>
  );
}

interface ComposerSlotProps {
  isSelecting: boolean;
  bar: ReactNode;
  children: ReactNode;
}

export function ComposerSlot({ isSelecting, bar, children }: ComposerSlotProps) {
  const [hasSelected, setHasSelected] = useState(false);
  if (isSelecting && !hasSelected) {
    setHasSelected(true);
  }

  useEffect(() => {
    if (isSelecting || !hasSelected) {
      return;
    }
    const timer = window.setTimeout(() => setHasSelected(false), MOTION_DURATION_MS.slow);
    return () => window.clearTimeout(timer);
  }, [isSelecting, hasSelected]);

  return (
    <>
      {isSelecting && bar}
      <div
        data-testid="composer-slot"
        className="sc-composer-slot"
        data-returning={hasSelected || undefined}
        style={{ display: isSelecting ? 'none' : 'contents' }}
      >
        {children}
      </div>
    </>
  );
}
