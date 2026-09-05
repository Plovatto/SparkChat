import { useCallback, useEffect, useRef, useState, type CSSProperties, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { FaChevronLeft, FaChevronRight, FaDownload, FaMinus, FaPlus, FaTimes } from 'react-icons/fa';
import { OverlayIconButton } from '@components/common/OverlayIconButton';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { downloadFromUrl } from '@lib/download-file';
import { MEDIA_VIEWER_BACKDROP_STYLE, MEDIA_VIEWER_CHROME_STYLE, MEDIA_VIEWER_CONTENT_SHADOW, MEDIA_VIEWER_DIVIDER_STYLE } from './media-viewer-styles';

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

const NAV_BUTTON_STYLE: CSSProperties = {
  position: 'fixed',
  top: '50%',
  zIndex: 10055,
  width: 'clamp(38px, 10vw, 48px)',
  height: 'clamp(38px, 10vw, 48px)',
  fontSize: '18px',
};

export function ImageModal({ isOpen, images, fileNames, startIndex = 0, onClose }: ImageModalProps) {
  const [zoom, setZoom] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const { isPresent, isExiting } = usePresence(isOpen, MOTION_DURATION_MS.fast);
  const lastImagesRef = useRef<string[]>([]);
  const hasMultiple = images.length > 1;

  if (isOpen && images.length > 0) {
    lastImagesRef.current = images;
  }

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

  const displayImages = isOpen ? images : lastImagesRef.current;
  const currentSrc = displayImages[currentIndex] ?? displayImages[0];
  const showsMultiple = displayImages.length > 1;

  if (!isPresent || !currentSrc) {
    return null;
  }

  const exitClassName = isExiting ? ' is-exiting' : '';
  const chromeClassName = isExiting ? 'sc-anim-fade-out' : 'sc-anim-media-chrome-in';

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
      <div className={`sc-modal-backdrop${exitClassName}`} style={MEDIA_VIEWER_BACKDROP_STYLE} onClick={onClose} />

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
          className={chromeClassName}
          style={{
            ...MEDIA_VIEWER_CHROME_STYLE,
            position: 'absolute',
            top: 'max(16px, env(safe-area-inset-top))',
            right: 'max(16px, env(safe-area-inset-right))',
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(2px, 1vw, 6px)',
            zIndex: 10055,
            padding: '6px',
          }}
        >
          <OverlayIconButton onClick={handleZoomOut} title="Diminuir zoom (-)">
            <FaMinus />
          </OverlayIconButton>

          <div
            style={{
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

          <OverlayIconButton onClick={handleZoomIn} title="Ampliar zoom (+)">
            <FaPlus />
          </OverlayIconButton>

          <div style={MEDIA_VIEWER_DIVIDER_STYLE} />

          <OverlayIconButton
            onClick={() => void downloadFromUrl(currentSrc, fileNames?.[currentIndex] ?? deriveImageFileName(currentSrc))}
            title="Baixar imagem"
          >
            <FaDownload />
          </OverlayIconButton>

          <div style={MEDIA_VIEWER_DIVIDER_STYLE} />

          <OverlayIconButton onClick={onClose} title="Fechar imagem (ESC)" variant="danger">
            <FaTimes />
          </OverlayIconButton>
        </div>

        {showsMultiple && (
          <div
            className={chromeClassName}
            style={{
              ...MEDIA_VIEWER_CHROME_STYLE,
              position: 'absolute',
              top: 'max(16px, env(safe-area-inset-top))',
              left: 'max(16px, env(safe-area-inset-left))',
              zIndex: 10055,
              boxShadow: 'none',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            {currentIndex + 1} / {displayImages.length}
          </div>
        )}

        {showsMultiple && (
          <>
            <button
              onClick={(event) => {
                event.stopPropagation();
                goToPrevious();
              }}
              title="Imagem anterior"
              className="sc-icon-btn sc-icon-btn--scrim-solid sc-media-nav-btn"
              style={{ ...NAV_BUTTON_STYLE, left: 'max(12px, env(safe-area-inset-left))' }}
            >
              <FaChevronLeft />
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                goToNext();
              }}
              title="Próxima imagem"
              className="sc-icon-btn sc-icon-btn--scrim-solid sc-media-nav-btn"
              style={{ ...NAV_BUTTON_STYLE, right: 'max(12px, env(safe-area-inset-right))' }}
            >
              <FaChevronRight />
            </button>
          </>
        )}

        <div
          className={isExiting ? 'sc-anim-media-content-out' : 'sc-anim-media-content-in'}
          style={{
            position: 'relative',
            maxHeight: '85vh',
            maxWidth: '95vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onWheel={handleWheel}
        >
          <img
            key={currentSrc}
            src={currentSrc}
            className="sc-anim-fade-in"
            alt="Imagem expandida"
            style={{
              maxHeight: '85vh',
              maxWidth: '95vw',
              objectFit: 'contain',
              borderRadius: '16px',
              boxShadow: MEDIA_VIEWER_CONTENT_SHADOW,
              transform: `scale(${zoom})`,
              transition: 'transform var(--sc-dur-normal) var(--sc-ease-spring-soft)',
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
    </>,
    document.body,
  );
}
