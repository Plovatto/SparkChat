import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { useBodyScrollLock } from '@hooks/useBodyScrollLock';
import { useEscapeKey } from '@hooks/useEscapeKey';

interface ModalProps {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  showCloseButton?: boolean;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, title, onClose, showCloseButton = true, children, maxWidth = '500px' }: ModalProps) {
  const { theme } = useTheme();
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <>
      <div
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
          animation: 'modalBackdropFadeIn 0.3s ease-out',
        }}
        onClick={onClose}
      />

      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10000,
          animation: 'modalPanelSlideIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          width: '90%',
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
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {title && (
            <div
              style={{
                padding: '20px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: theme.gradient,
                boxShadow: theme.shadowSm,
                flexShrink: 0,
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: theme.onGradient, letterSpacing: '-0.3px' }}>{title}</h2>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  title="Fechar"
                  aria-label="Fechar"
                  className="sc-icon-btn sc-icon-btn--header"
                  style={{ width: '34px', height: '34px' }}
                >
                  <FaTimes size={15} />
                </button>
              )}
            </div>
          )}

          <div
            style={{
              padding: '24px',
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              color: theme.textPrimary,
              scrollbarGutter: 'stable both-edges',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
