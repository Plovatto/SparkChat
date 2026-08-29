import { useEffect, useState, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { FaMinus, FaPlus, FaTimes } from 'react-icons/fa';

interface ImageModalProps {
  isOpen: boolean;
  imageSrc: string;
  onClose: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;

export function ImageModal({ isOpen, imageSrc, onClose }: ImageModalProps) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!isOpen) {
      setZoom(1);
    }
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

  const handleZoomIn = () => setZoom((previous) => Math.min(previous + ZOOM_STEP, MAX_ZOOM));
  const handleZoomOut = () => setZoom((previous) => Math.max(previous - ZOOM_STEP, MIN_ZOOM));

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

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
          padding: '20px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '30px',
            right: '30px',
            display: 'flex',
            gap: '15px',
            zIndex: 10055,
            animation: 'imageModalSlideDown 0.4s ease-out',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '10px',
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: '14px',
              padding: '12px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
            }}
          >
            <button
              onClick={handleZoomOut}
              title="Diminuir zoom (-)"
              style={{
                background: 'rgba(102, 126, 234, 0.8)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                color: 'white',
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                fontSize: '18px',
                fontWeight: 700,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'rgba(102, 126, 234, 1)';
                event.currentTarget.style.transform = 'scale(1.15)';
                event.currentTarget.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.6)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'rgba(102, 126, 234, 0.8)';
                event.currentTarget.style.transform = 'scale(1)';
                event.currentTarget.style.boxShadow = 'none';
              }}
            >
              <FaMinus />
            </button>

            <div
              style={{
                color: 'white',
                fontSize: '14px',
                fontWeight: 700,
                minWidth: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                letterSpacing: '0.5px',
              }}
            >
              {Math.round(zoom * 100)}%
            </div>

            <button
              onClick={handleZoomIn}
              title="Ampliar zoom (+)"
              style={{
                background: 'rgba(102, 126, 234, 0.8)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                color: 'white',
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                fontSize: '18px',
                fontWeight: 700,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'rgba(102, 126, 234, 1)';
                event.currentTarget.style.transform = 'scale(1.15)';
                event.currentTarget.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.6)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'rgba(102, 126, 234, 0.8)';
                event.currentTarget.style.transform = 'scale(1)';
                event.currentTarget.style.boxShadow = 'none';
              }}
            >
              <FaPlus />
            </button>
          </div>

          <button
            onClick={onClose}
            title="Fechar imagem (ESC)"
            style={{
              background: 'rgba(239, 68, 68, 0.85)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              width: '60px',
              height: '50px',
              borderRadius: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              fontSize: '22px',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
              fontWeight: 700,
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'rgba(239, 68, 68, 1)';
              event.currentTarget.style.transform = 'scale(1.15)';
              event.currentTarget.style.boxShadow = '0 0 25px rgba(239, 68, 68, 0.7)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'rgba(239, 68, 68, 0.85)';
              event.currentTarget.style.transform = 'scale(1)';
              event.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.5)';
            }}
          >
            <FaTimes />
          </button>
        </div>

        <div
          style={{
            position: 'relative',
            maxHeight: '85vh',
            maxWidth: '95vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'imageModalSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
          onWheel={handleWheel}
        >
          <img
            src={imageSrc}
            alt="Imagem expandida"
            style={{
              maxHeight: '85vh',
              maxWidth: '95vw',
              objectFit: 'contain',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
              transform: `scale(${zoom})`,
              transition: 'transform 0.2s ease',
              cursor: 'grab',
            }}
            onMouseDown={(event) => {
              event.currentTarget.style.cursor = 'grabbing';
            }}
            onMouseUp={(event) => {
              event.currentTarget.style.cursor = 'grab';
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
