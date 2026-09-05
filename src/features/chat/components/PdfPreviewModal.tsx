import { Modal } from '@components/common/Modal';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  fileName: string;
}

export function PdfPreviewModal({ isOpen, onClose, url, fileName }: PdfPreviewModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={fileName} maxWidth="900px">
      <iframe
        src={url}
        title={fileName}
        style={{ width: '100%', height: '75vh', border: 'none', borderRadius: '8px', display: 'block' }}
      />
    </Modal>
  );
}
