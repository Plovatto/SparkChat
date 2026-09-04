import { createPortal } from 'react-dom';
import { FaDownload, FaTimes } from 'react-icons/fa';
import { OverlayIconButton } from '@components/common/OverlayIconButton';
import { useBodyScrollLock } from '@hooks/useBodyScrollLock';
import { useEscapeKey } from '@hooks/useEscapeKey';
import { downloadFromUrl } from '@lib/download-file';

interface VideoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  fileName: string;
}

export function VideoPreviewModal({ isOpen, onClose, url, fileName }: VideoPreviewModalProps) {
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
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 10040,
          animation: 'mediaOverlayFadeIn 0.3s ease-out',
        }}
        onClick={onClose}
      />

      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10050,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 'max(16px, env(safe-area-inset-top))',
            right: 'max(16px, env(safe-area-inset-right))',
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(2px, 1vw, 6px)',
            zIndex: 10055,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '999px',
            padding: '6px',
            border: '2px solid rgba(255, 255, 255, 0.25)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
            animation: 'mediaOverlaySlideDown 0.4s ease-out',
          }}
        >
          <OverlayIconButton onClick={() => void downloadFromUrl(url, fileName)} title="Baixar vídeo">
            <FaDownload />
          </OverlayIconButton>

          <div style={{ width: '1px', height: '22px', background: 'rgba(255, 255, 255, 0.25)', margin: '0 2px', flexShrink: 0 }} />

          <OverlayIconButton onClick={onClose} title="Fechar vídeo (ESC)" variant="danger">
            <FaTimes />
          </OverlayIconButton>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 'max(16px, env(safe-area-inset-top))',
            left: 'max(16px, env(safe-area-inset-left))',
            maxWidth: 'calc(100vw - 140px)',
            zIndex: 10055,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '999px',
            padding: '8px 16px',
            border: '2px solid rgba(255, 255, 255, 0.25)',
            color: 'white',
            fontSize: '13px',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fileName}
        </div>

        <div
          style={{
            position: 'relative',
            maxHeight: '92vh',
            maxWidth: '96vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'mediaOverlayZoomIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <video
            src={url}
            controls
            autoPlay
            style={{
              maxHeight: '92vh',
              maxWidth: '96vw',
              display: 'block',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
              background: '#000',
            }}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
