import { useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FaTimes } from 'react-icons/fa';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useTheme } from '@features/theme';
import { useBackdropDismiss } from '@hooks/useBackdropDismiss';
import { useBodyScrollLock } from '@hooks/useBodyScrollLock';
import { useEscapeKey } from '@hooks/useEscapeKey';

interface ModalProps {
  isOpen: boolean;
  title?: string;
  header?: ReactNode;
  onClose: () => void;
  showCloseButton?: boolean;
  children: ReactNode;
  maxWidth?: string;
  bodyStyle?: CSSProperties;
  panelClassName?: string;
}

interface ModalContent {
  title?: string;
  header?: ReactNode;
  children: ReactNode;
}

export function Modal({ isOpen, title, header, onClose, showCloseButton = true, children, maxWidth = '500px', bodyStyle, panelClassName }: ModalProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { isPresent, isExiting } = usePresence(isOpen, MOTION_DURATION_MS.normal);
  const lastContentRef = useRef<ModalContent>({ children: null });
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);
  const backdropDismissProps = useBackdropDismiss(onClose);

  if (isOpen) {
    lastContentRef.current = { title, header, children };
  }

  if (!isPresent) {
    return null;
  }

  const content = isOpen ? { title, header, children } : lastContentRef.current;
  const exitClassName = isExiting ? ' is-exiting' : '';

  return createPortal(
    <>
      <div
        className={`sc-modal-backdrop${exitClassName}`}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: theme.overlay,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 9999,
        }}
        {...backdropDismissProps}
      />

      <div
        className={`sc-modal-panel${panelClassName ? ` ${panelClassName}` : ''}${exitClassName}`}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10000,
          width: 'calc(100% - 2 * var(--sc-modal-gutter, 5%))',
          maxWidth,
        }}
      >
        <div
          style={{
            background: theme.surfaceElevated,
            border: `1px solid ${theme.borderSubtle}`,
            borderRadius: '18px',
            boxShadow: theme.shadowLg,
            overflow: 'hidden',
            maxHeight: 'var(--sc-modal-max-height, 90vh)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {content.header ?? (content.title && (
            <div
              style={{
                padding: 'var(--sc-modal-header-padding, 20px 24px)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: theme.gradient,
                boxShadow: theme.shadowSm,
                flexShrink: 0,
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: theme.onGradient, letterSpacing: '-0.3px' }}>{content.title}</h2>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  title={t('common.close')}
                  aria-label={t('common.close')}
                  className="sc-icon-btn sc-icon-btn--header"
                  style={{ width: '34px', height: '34px' }}
                >
                  <FaTimes size={15} />
                </button>
              )}
            </div>
          ))}

          <div
            style={{
              padding: 'var(--sc-modal-padding, 24px)',
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              color: theme.textPrimary,
              scrollbarGutter: 'var(--sc-modal-scrollbar-gutter, stable both-edges)',
              ...bodyStyle,
            }}
          >
            {content.children}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
