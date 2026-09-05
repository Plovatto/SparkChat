import { FaTimes, FaTrash } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ isOpen, title, message, confirmLabel = 'Deletar para todos', onConfirm, onCancel }: ConfirmDialogProps) {
  const { theme } = useTheme();

  const handleConfirm = () => {
    onConfirm();
    onCancel();
  };

  return (
    <Modal isOpen={isOpen} title={title} onClose={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6, color: theme.textPrimary }}>{message}</p>

        <div className="sc-notice sc-notice--danger" style={{ alignItems: 'center' }}>
          <FaTrash size={13} style={{ flexShrink: 0, opacity: 0.85 }} />
          <span>Esta ação não pode ser desfeita.</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="sc-btn sc-btn--secondary sc-btn--lift" style={{ padding: '10px 24px', fontWeight: 500 }}>
            <FaTimes size={14} />
            Cancelar
          </button>

          <button onClick={handleConfirm} className="sc-btn sc-btn--danger sc-btn--lift" style={{ padding: '10px 24px' }}>
            <FaTrash size={14} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
