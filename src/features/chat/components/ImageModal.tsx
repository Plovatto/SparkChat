import { useCallback, useEffect, useState, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { FaChevronLeft, FaChevronRight, FaDownload, FaMinus, FaPlus, FaTimes } from 'react-icons/fa';
import { downloadFromUrl } from '@lib/download-file';

function deriveImageFileName(url: string): string {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const segment = pathname.split('/').pop();
    return segment ? decodeURIComponent(segment) : 'imagem.jpg';
  } catch {
    return 'imagem.jpg';
  }
}

interface ImageModalProps {
  isOpen: boolean;
  images: string[];
  fileNames?: string[];
  startIndex?: number;
  onClose: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;

export function ImageModal({ isOpen, images, fileNames, startIndex = 0, onClose }: ImageModalProps) {
  const [zoom, setZoom] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const hasMultiple = images.length > 1;

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(startIndex);
      setZoom(1);
    }
  }, [isOpen, startIndex]);

  const goToPrevious = useCallback(() => {
    setZoom(1);
    setCurrentIndex((previous) => (previous - 1 + images.length) % images.length);
  }, [images.length]);

  const goToNext = useCallback(() => {
    setZoom(1);
    setCurrentIndex((previous) => (previous + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft' && hasMultiple) {
        goToPrevious();
      } else if (event.key === 'ArrowRight' && hasMultiple) {
        goToNext();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, hasMultiple, goToPrevious, goToNext]);

  if (!isOpen || images.length === 0) {
    return null;
  }

  const currentSrc = images[currentIndex] ?? images[0]!;

  const handleZoomIn = () => setZoom((previous) => Math.min(previous + ZOOM_STEP, MAX_ZOOM));
  const handleZoomOut = () => setZoom((previous) => Math.max(previous - ZOOM_STEP, MIN_ZOOM));

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  const navButtonStyle = {
    position: 'fixed' as const,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 10055,
    background: 'rgba(0, 0, 0, 0.6)',
    border: '2px solid rgba(255, 255, 255, 0.25)',
    color: 'white',
    width: 'clamp(38px, 10vw, 48px)',
    height: 'clamp(38px, 10vw, 48px)',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s ease',
    fontSize: '18px',
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
            onClick={handleZoomOut}
            title="Diminuir zoom (-)"
            style={{
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
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
            }}
          >
            <FaMinus />
          </button>

          <div
            style={{
              color: 'white',
              fontSize: '13px',
              fontWeight: 700,
              minWidth: '44px',
              textAlign: 'center',
              letterSpacing: '0.3px',
              opacity: 0.9,
            }}
          >
            {Math.round(zoom * 100)}%
          </div>

          <button
            onClick={handleZoomIn}
            title="Ampliar zoom (+)"
            style={{
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
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
            }}
          >
            <FaPlus />
          </button>

          <div style={{ width: '1px', height: '22px', background: 'rgba(255, 255, 255, 0.25)', margin: '0 2px', flexShrink: 0 }} />

          <button
            onClick={() => void downloadFromUrl(currentSrc, fileNames?.[currentIndex] ?? deriveImageFileName(currentSrc))}
            title="Baixar imagem"
            style={{
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
            }}
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
            title="Fechar imagem (ESC)"
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

        {hasMultiple && (
          <div
            style={{
              position: 'absolute',
              top: 'max(16px, env(safe-area-inset-top))',
              left: 'max(16px, env(safe-area-inset-left))',
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
            }}
          >
            {currentIndex + 1} / {images.length}
          </div>
        )}

        {hasMultiple && (
          <>
            <button
              onClick={(event) => {
                event.stopPropagation();
                goToPrevious();
              }}
              title="Imagem anterior"
              style={{ ...navButtonStyle, left: 'max(12px, env(safe-area-inset-left))' }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
              }}
            >
              <FaChevronLeft />
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                goToNext();
              }}
              title="Próxima imagem"
              style={{ ...navButtonStyle, right: 'max(12px, env(safe-area-inset-right))' }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
              }}
            >
              <FaChevronRight />
            </button>
          </>
        )}

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
            src={currentSrc}
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
