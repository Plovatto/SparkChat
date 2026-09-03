import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaDownload, FaTimes } from 'react-icons/fa';
import { downloadFromUrl } from '@lib/download-file';

interface VideoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  fileName: string;
}

const controlButtonStyle = {
  background: 'rgba(255, 255, 255, 0.12)',
  border: 'none',
  color: 'white',
  width: 'clamp(34px, 9vw, 40px)',
  height: 'clamp(34px, 9vw, 40px)',
  borderRadius: '50%',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.2s ease',
  fontSize: '15px',
  flexShrink: 0,
} as const;

export function VideoPreviewModal({ isOpen, onClose, url, fileName }: VideoPreviewModalProps) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'auto';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
          animation: 'imageModalFadeIn 0.3s ease-out',
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
            animation: 'imageModalSlideDown 0.4s ease-out',
          }}
        >
          <button
            onClick={() => void downloadFromUrl(url, fileName)}
            title="Baixar vídeo"
            style={controlButtonStyle}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
            }}
          >
            <FaDownload />
          </button>

          <div style={{ width: '1px', height: '22px', background: 'rgba(255, 255, 255, 0.25)', margin: '0 2px', flexShrink: 0 }} />

          <button
            onClick={onClose}
            title="Fechar vídeo (ESC)"
            style={{
              background: 'rgba(239, 68, 68, 0.85)',
              border: 'none',
              color: 'white',
              width: 'clamp(34px, 9vw, 40px)',
              height: 'clamp(34px, 9vw, 40px)',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s ease',
              fontSize: '16px',
              flexShrink: 0,
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'rgba(239, 68, 68, 1)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'rgba(239, 68, 68, 0.85)';
            }}
          >
            <FaTimes />
          </button>
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
            animation: 'imageModalSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
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

      <style>{`
        @keyframes imageModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes imageModalSlideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes imageModalSlideIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>,
    document.body,
  );
}
