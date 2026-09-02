import { FaTimes, FaTrash } from 'react-icons/fa';
import type { RoomThemePalette } from '@features/rooms/constants/default-theme';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  theme: RoomThemePalette;
}

export function ConfirmDialog({ isOpen, title, message, confirmLabel = 'Deletar para todos', onConfirm, onCancel, theme }: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onCancel();
  };

  return (
    <Modal isOpen={isOpen} title={title} onClose={onCancel} theme={theme}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6, color: theme.text }}>{message}</p>

        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '0.85rem',
            color: '#ef4444',
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
          }}
        >
          <FaTrash size={13} style={{ flexShrink: 0, opacity: 0.85 }} />
          <span>Esta ação não pode ser desfeita.</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 24px',
              borderRadius: '10px',
              border: `1px solid ${theme.border}`,
              background: theme.background,
              color: theme.text,
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.transform = 'translateY(-2px)';
              event.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.transform = 'translateY(0)';
              event.currentTarget.style.boxShadow = 'none';
            }}
          >
            <FaTimes size={14} />
            Cancelar
          </button>

          <button
            onClick={handleConfirm}
            style={{
              padding: '10px 24px',
              borderRadius: '10px',
              border: 'none',
              background: '#ef4444',
              color: 'white',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.transform = 'translateY(-2px)';
              event.currentTarget.style.boxShadow = '0 8px 20px rgba(239, 68, 68, 0.4)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.transform = 'translateY(0)';
              event.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
            }}
          >
            <FaTrash size={14} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
