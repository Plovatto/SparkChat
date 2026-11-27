import { useCallback, useEffect, useId, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FaTimes, FaTrashAlt } from 'react-icons/fa';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useBackdropDismiss } from '@hooks/useBackdropDismiss';
import { useBackLayer } from '@hooks/useBackLayer';
import { useBodyScrollLock } from '@hooks/useBodyScrollLock';
import { useEscapeKey } from '@hooks/useEscapeKey';
import { useMediaQuery } from '@hooks/useMediaQuery';
import '../styles/delete-messages.css';

export const DELETE_SHEET_QUERY = '(max-width: 768px)';

const DRAG_DISMISS_PX = 90;

interface DeleteMessageDialogProps {
  isOpen: boolean;
  count: number;
  canDeleteForEveryone: boolean;
  onDeleteForEveryone: () => void;
  onDeleteForMe: () => void;
  onClose: () => void;
}

interface DialogSnapshot {
  count: number;
  canDeleteForEveryone: boolean;
}

const FOCUSABLE_SELECTOR = 'button:not([disabled])';

export function DeleteMessageDialog({ isOpen, count, canDeleteForEveryone, onDeleteForEveryone, onDeleteForMe, onClose }: DeleteMessageDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const { isPresent, isExiting } = usePresence(isOpen, MOTION_DURATION_MS.normal);
  const isSheet = useMediaQuery(DELETE_SHEET_QUERY);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; offset: number } | null>(null);
  const snapshotRef = useRef<DialogSnapshot>({ count, canDeleteForEveryone });
  const backdropDismissProps = useBackdropDismiss(onClose);
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);
  useBackLayer(isOpen, onClose);

  if (isOpen) {
    snapshotRef.current = { count, canDeleteForEveryone };
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      restoreFocusRef.current?.focus({ preventScroll: true });
      restoreFocusRef.current = null;
    };
  }, [isOpen]);

  const trapFocus = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) {
      return;
    }
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
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
  }, []);

  const setDragOffset = (offset: number) => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    panel.style.setProperty('--sc-sheet-drag', `${offset}px`);
    panel.dataset.dragging = offset > 0 ? 'true' : 'false';
  };

  const handleDragStart = (event: PointerEvent<HTMLDivElement>) => {
    if (!isSheet || (event.target as HTMLElement).closest('button')) {
      return;
    }
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, offset: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    drag.offset = Math.max(0, event.clientY - drag.startY);
    setDragOffset(drag.offset);
  };

  const handleDragEnd = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    if (drag.offset > DRAG_DISMISS_PX) {
      onClose();
      return;
    }
    setDragOffset(0);
  };

  if (!isPresent) {
    return null;
  }

  const snapshot = isOpen ? { count, canDeleteForEveryone } : snapshotRef.current;
  const exitClassName = isExiting ? ' is-exiting' : '';
  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return createPortal(
    <>
      <div className={`sc-modal-backdrop sc-delete-backdrop${exitClassName}`} data-testid="delete-dialog-backdrop" {...backdropDismissProps} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`sc-delete-dialog${isSheet ? ' is-sheet' : ''}${exitClassName}`}
        onKeyDown={trapFocus}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="sc-delete-dialog__header"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          {isSheet && <span className="sc-delete-dialog__handle" aria-hidden="true" />}
          <span className="sc-delete-dialog__icon" aria-hidden="true">
            <FaTrashAlt size={15} />
          </span>
          <div className="sc-delete-dialog__heading">
            <h2 id={titleId} className="sc-delete-dialog__title">
              {t('chat.deleteDialog.title', { count: snapshot.count })}
            </h2>
            <p className="sc-delete-dialog__subtitle">{t('dialogs.irreversible')}</p>
          </div>
          <button type="button" onClick={onClose} className="sc-delete-dialog__close" aria-label={t('common.close')} title={t('common.close')}>
            <FaTimes size={13} />
          </button>
        </div>

        <div className="sc-delete-dialog__body">
          <p id={descriptionId} className="sc-delete-dialog__text">
            {snapshot.canDeleteForEveryone
              ? t('chat.deleteDialog.bodyBoth', { count: snapshot.count })
              : t('chat.deleteDialog.bodyForMe', { count: snapshot.count })}
          </p>

          <div className="sc-delete-dialog__actions">
            {snapshot.canDeleteForEveryone && (
              <button type="button" className="sc-delete-dialog__btn sc-delete-dialog__btn--everyone" onClick={run(onDeleteForEveryone)}>
                <FaTrashAlt size={13} aria-hidden="true" />
                {t('chat.deleteDialog.forEveryone')}
              </button>
            )}
            <button type="button" className="sc-delete-dialog__btn sc-delete-dialog__btn--me" onClick={run(onDeleteForMe)}>
              {t('chat.deleteDialog.forMe')}
            </button>
            <button ref={cancelRef} type="button" className="sc-delete-dialog__cancel" onClick={onClose}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
