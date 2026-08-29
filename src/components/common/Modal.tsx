import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';

export interface ModalPalette {
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
}

interface ModalProps {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  showCloseButton?: boolean;
  theme: ModalPalette;
  children: ReactNode;
}

export function Modal({ isOpen, title, onClose, showCloseButton = true, theme, children }: ModalProps) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'auto';

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

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
          background: 'rgba(0, 0, 0, 0.62)',
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
          maxWidth: '500px',
        }}
      >
        <div
          style={{
            background: theme.surface,
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), 0 0 1px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {title && (
            <div
              style={{
                padding: '24px 28px',
                borderBottom: `1px solid ${theme.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: theme.surface,
                flexShrink: 0,
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: theme.text, letterSpacing: '-0.3px' }}>
                {title}
              </h2>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: theme.textSecondary,
                    cursor: 'pointer',
                    fontSize: '24px',
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.color = theme.text;
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.color = theme.textSecondary;
                  }}
                >
                  <FaTimes />
                </button>
              )}
            </div>
          )}

          <div style={{ padding: '28px', flex: 1, overflowY: 'auto', color: theme.text }}>{children}</div>
        </div>
      </div>
    </>,
    document.body,
  );
}
