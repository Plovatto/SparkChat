import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LuArrowLeft, LuX } from 'react-icons/lu';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useBackdropDismiss } from '@hooks/useBackdropDismiss';
import { useBodyScrollLock } from '@hooks/useBodyScrollLock';
import { useEscapeKey } from '@hooks/useEscapeKey';
import './side-drawer.css';

interface SideDrawerProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onBack?: () => void;
  footer?: ReactNode;
  viewKey?: string;
  inline?: boolean;
  children: ReactNode;
}

interface DrawerContent {
  title: string;
  footer?: ReactNode;
  viewKey?: string;
  onBack?: () => void;
  children: ReactNode;
}

export function SideDrawer({ isOpen, title, onClose, onBack, footer, viewKey, inline = false, children }: SideDrawerProps) {
  const { t } = useTranslation();
  const { isPresent, isExiting } = usePresence(isOpen, MOTION_DURATION_MS.slow);
  const lastContentRef = useRef<DrawerContent>({ title, children });
  useBodyScrollLock(isOpen && !inline);
  useEscapeKey(isOpen, onBack ?? onClose);
  const backdropDismissProps = useBackdropDismiss(onClose);
  const [previousViewKey, setPreviousViewKey] = useState(viewKey);
  const [hasNavigated, setHasNavigated] = useState(false);

  if (viewKey !== previousViewKey) {
    setPreviousViewKey(viewKey);
    setHasNavigated(true);
  }
  if (!isOpen && hasNavigated) {
    setHasNavigated(false);
  }

  if (isOpen) {
    lastContentRef.current = { title, footer, viewKey, onBack, children };
  }

  if (!isPresent) {
    return null;
  }

  const content = isOpen ? { title, footer, viewKey, onBack, children } : lastContentRef.current;
  const stateClassName = isExiting ? ' is-exiting' : '';

  const panel = (
    <aside
      className={`sc-drawer${inline ? ' sc-drawer--inline' : ''}${stateClassName}`}
      role={inline ? 'complementary' : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-label={content.title}
    >
      <header className="sc-drawer__header">
        {content.onBack && (
          <button type="button" className="sc-drawer__icon-btn sc-drawer__back" onClick={content.onBack} aria-label={t('common.back')} title={t('common.back')}>
            <LuArrowLeft size={18} aria-hidden="true" />
          </button>
        )}
        <h2 key={content.viewKey ?? content.title} className="sc-drawer__title">
          {content.title}
        </h2>
        <button type="button" className="sc-drawer__icon-btn" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
          <LuX size={18} aria-hidden="true" />
        </button>
      </header>
      <div key={content.viewKey} className="sc-drawer__body" data-direction={!hasNavigated ? 'none' : content.onBack ? 'forward' : 'back'}>
        {content.children}
      </div>
      {content.footer && <footer className="sc-drawer__footer">{content.footer}</footer>}
    </aside>
  );

  if (inline) {
    return panel;
  }

  return createPortal(
    <>
      <div className={`sc-drawer-backdrop${stateClassName}`} {...backdropDismissProps} />
      {panel}
    </>,
    document.body,
  );
}
