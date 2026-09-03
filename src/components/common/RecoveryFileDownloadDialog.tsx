import { useState } from 'react';
import { FaCheckCircle, FaDownload, FaShieldAlt } from 'react-icons/fa';
import { saveRecoveryFile } from '@lib/recovery-file-storage';
import { Modal, type ModalPalette } from './Modal';

interface RecoveryFileDownloadDialogProps {
  isOpen: boolean;
  userId: string;
  nickname: string;
  recoveryFile: string;
  onClose: () => void;
  theme: ModalPalette;
  isFirstDownload?: boolean;
}

export function RecoveryFileDownloadDialog({
  isOpen,
  userId,
  nickname,
  recoveryFile,
  onClose,
  theme,
  isFirstDownload = false,
}: RecoveryFileDownloadDialogProps) {
  const [hasDownloaded, setHasDownloaded] = useState(false);

  const handleDownload = async () => {
    const saved = await saveRecoveryFile(recoveryFile, `sparkchat-${nickname.toLowerCase()}.sparkkey`, userId);
    if (saved) {
      setHasDownloaded(true);
    }
  };

  const handleClose = () => {
    setHasDownloaded(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} title="Seu arquivo de recuperação" onClose={() => {}} showCloseButton={false} theme={theme}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6, color: theme.text }}>
          Esse arquivo é a sua chave reserva para entrar na conta caso esqueça sua senha. Guarde em um lugar seguro —
          se você perder o arquivo e a senha ao mesmo tempo, ninguém consegue recuperar sua conta.
        </p>

        <div
          style={{
            background: 'rgba(102, 126, 234, 0.12)',
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '0.85rem',
            color: theme.textSecondary,
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
          }}
        >
          <FaShieldAlt size={14} style={{ flexShrink: 0, opacity: 0.85 }} />
          <span>O arquivo não contém sua senha em texto — só o servidor consegue usá-lo para autenticar você.</span>
        </div>

        {!isFirstDownload && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '12px',
              padding: '12px 16px',
              fontSize: '0.85rem',
              color: '#ef4444',
            }}
          >
            Se você já tinha um arquivo salvo, substitua-o por este — o anterior deixou de funcionar.
          </div>
        )}

        <button
          onClick={() => void handleDownload()}
          style={{
            padding: '12px 24px',
            borderRadius: '10px',
            border: 'none',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
          }}
        >
          <FaDownload size={15} />
          {hasDownloaded ? 'Baixar novamente' : 'Baixar arquivo'}
        </button>

        <button
          onClick={handleClose}
          disabled={!hasDownloaded}
          style={{
            padding: '10px 24px',
            borderRadius: '10px',
            border: `1px solid ${theme.border}`,
            background: hasDownloaded ? theme.surface : 'transparent',
            color: theme.text,
            fontSize: '0.95rem',
            fontWeight: 500,
            cursor: hasDownloaded ? 'pointer' : 'not-allowed',
            opacity: hasDownloaded ? 1 : 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <FaCheckCircle size={15} />
          Já baixei, continuar
        </button>
      </div>
    </Modal>
  );
}
