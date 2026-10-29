import { Modal } from '@components/common/Modal';
import { toSafeMediaUrl } from '../utils/safe-media-url';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  fileName: string;
}

export function PdfPreviewModal({ isOpen, onClose, url, fileName }: PdfPreviewModalProps) {
  const safeUrl = toSafeMediaUrl(url);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={fileName} maxWidth="900px">
      {safeUrl ? (
        <iframe
          src={safeUrl}
          title={fileName}
          style={{ width: '100%', height: '75vh', border: 'none', borderRadius: '8px', display: 'block' }}
        />
      ) : (
        <p style={{ margin: 0, textAlign: 'center' }}>Não foi possível abrir este PDF.</p>
      )}
    </Modal>
  );
}
