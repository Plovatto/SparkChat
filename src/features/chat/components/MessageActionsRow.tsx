import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LuCopy, LuEllipsisVertical, LuForward, LuLanguages, LuReply, LuSmilePlus, LuTrash2 } from 'react-icons/lu';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useEscapeKey } from '@hooks/useEscapeKey';
import { useMediaQuery } from '@hooks/useMediaQuery';
import '../styles/message-actions.css';

export const MESSAGE_ACTIONS_SHEET_QUERY = '(max-width: 767.98px), (hover: none)';

interface MessageActionsRowProps {
  isOwn: boolean;
  isExiting?: boolean;
  canDelete?: boolean;
  canCopy?: boolean;
  canTranslate?: boolean;
  sheetHeader?: ReactNode;
  onReply: () => void;
  onDelete: () => void;
  onForward: () => void;
  onCopy?: () => void;
  onTranslate?: () => void;
  onReact?: () => void;
  onDismiss?: () => void;
}

interface ActionItem {
  key: string;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  tone?: 'danger';
}

function useActionItems({ canDelete, canCopy, canTranslate, onReply, onForward, onCopy, onTranslate, onDelete }: MessageActionsRowProps) {
  const { t } = useTranslation();
  const primary: ActionItem[] = [
    { key: 'reply', icon: <LuReply size={18} />, label: t('chat.message.reply'), onSelect: onReply },
    { key: 'forward', icon: <LuForward size={18} />, label: t('chat.message.forward'), onSelect: onForward },
  ];
  const secondary: ActionItem[] = [];
  if (canCopy && onCopy) {
    secondary.push({ key: 'copy', icon: <LuCopy size={18} />, label: t('chat.message.copyText'), onSelect: onCopy });
  }
  if (canTranslate && onTranslate) {
    secondary.push({ key: 'translate', icon: <LuLanguages size={18} />, label: t('chat.message.translate'), onSelect: onTranslate });
  }
  const danger: ActionItem[] = canDelete ? [{ key: 'delete', icon: <LuTrash2 size={18} />, label: t('chat.message.deleteAction'), onSelect: onDelete, tone: 'danger' }] : [];
  return { primary, secondary, danger };
}

function ActionsSheet(props: MessageActionsRowProps) {
  const { t } = useTranslation();
  const { primary, secondary, danger } = useActionItems(props);
  const isClosing = Boolean(props.isExiting);
  useEscapeKey(!isClosing, () => props.onDismiss?.());

  const run = (item: ActionItem) => (event: ReactMouseEvent) => {
    event.stopPropagation();
    item.onSelect();
    props.onDismiss?.();
  };

  return createPortal(
    <>
      <div className={`sc-actions-sheet-backdrop${isClosing ? ' is-exiting' : ''}`} onClick={() => props.onDismiss?.()} />
      <div
        className={`sc-actions-sheet${isClosing ? ' is-exiting' : ''}`}
        role="menu"
        aria-label={t('chat.message.actions')}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="sc-actions-sheet__grabber" aria-hidden="true" />
        {props.sheetHeader}
        <div className="sc-actions-sheet__list">
          {[...primary, ...secondary].map((item, index) => (
            <button key={item.key} type="button" role="menuitem" className="sc-actions-sheet__item" style={{ '--sc-i': index } as CSSProperties} onClick={run(item)}>
              <span className="sc-actions-sheet__icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
          {danger.length > 0 && <span className="sc-actions-sheet__divider" aria-hidden="true" />}
          {danger.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              data-tone="danger"
              className="sc-actions-sheet__item"
              style={{ '--sc-i': primary.length + secondary.length } as CSSProperties}
              onClick={run(item)}
            >
              <span className="sc-actions-sheet__icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}

function ActionsToolbar(props: MessageActionsRowProps) {
  const { t } = useTranslation();
  const { secondary, danger } = useActionItems(props);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = usePresence(menuOpen, MOTION_DURATION_MS.fast);
  const rootRef = useRef<HTMLDivElement>(null);
  const overflow = [...secondary, ...danger];
  useEscapeKey(menuOpen, () => setMenuOpen(false));

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const button = (key: string, label: string, icon: ReactNode, onClick: () => void) => (
    <button
      key={key}
      type="button"
      className="sc-actions-toolbar__btn"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {icon}
    </button>
  );

  return (
    <div
      ref={rootRef}
      className={`sc-actions-toolbar${props.isExiting ? ' is-exiting' : ''}`}
      data-own={props.isOwn}
      role="toolbar"
      aria-label={t('chat.message.actions')}
      onClick={(event) => event.stopPropagation()}
    >
      {button('reply', t('chat.message.reply'), <LuReply size={16} />, props.onReply)}
      {props.onReact && button('react', t('chat.message.react'), <LuSmilePlus size={16} />, props.onReact)}
      {button('forward', t('chat.message.forward'), <LuForward size={16} />, props.onForward)}
      {overflow.length > 0 &&
        button('more', t('chat.message.more'), <LuEllipsisVertical size={16} />, () => setMenuOpen((open) => !open))}
      {menu.isPresent && (
        <div className={`sc-actions-menu${menu.isExiting ? ' is-exiting' : ''}`} role="menu" data-own={props.isOwn}>
          {overflow.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              data-tone={item.tone}
              className="sc-actions-menu__item"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
                item.onSelect();
              }}
            >
              <span className="sc-actions-menu__icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageActionsRow(props: MessageActionsRowProps) {
  const useSheet = useMediaQuery(MESSAGE_ACTIONS_SHEET_QUERY);
  return useSheet ? <ActionsSheet {...props} /> : <ActionsToolbar {...props} />;
}
