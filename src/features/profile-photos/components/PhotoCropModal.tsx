import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { useTranslation } from 'react-i18next';
import { FaCheck, FaSearchMinus, FaSearchPlus, FaTimes } from 'react-icons/fa';
import { Spinner } from '@components/common/Spinner';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useTheme, withAlpha } from '@features/theme';
import { useBodyScrollLock } from '@hooks/useBodyScrollLock';
import { profilePhotoErrorKey, type PhotoCropArea, type ProfilePhotoErrorKey } from '@lib/media/profile-photo-compression';
import './profile-photos.css';

export const CROP_MIN_ZOOM = 1;
export const CROP_MAX_ZOOM = 4;
const CROP_ZOOM_STEP = 0.25;
const INITIAL_CROP: Point = { x: 0, y: 0 };
const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(event: KeyboardEvent, container: HTMLElement | null): void {
  if (!container) {
    return;
  }
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus({ preventScroll: true });
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && container.contains(active);
  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault();
    last?.focus({ preventScroll: true });
  } else if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault();
    first?.focus({ preventScroll: true });
  }
}

interface PhotoCropModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  onCancel: () => void;
  onConfirm: (area: PhotoCropArea) => Promise<void>;
}

function clampZoom(value: number): number {
  return Math.min(CROP_MAX_ZOOM, Math.max(CROP_MIN_ZOOM, value));
}

function staggerStyle(index: number): CSSProperties {
  return { '--sc-stagger-index': index, '--sc-stagger-step': '60ms' } as CSSProperties;
}

export function PhotoCropModal({ isOpen, imageUrl, onCancel, onConfirm }: PhotoCropModalProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const titleId = useId();
  const hintId = useId();
  const { isPresent, isExiting } = usePresence(isOpen, MOTION_DURATION_MS.normal);
  const [crop, setCrop] = useState<Point>(INITIAL_CROP);
  const [zoom, setZoom] = useState(CROP_MIN_ZOOM);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ProfilePhotoErrorKey | ''>('');
  const areaRef = useRef<Area | null>(null);
  const lastImageRef = useRef<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  if (isOpen && imageUrl) {
    lastImageRef.current = imageUrl;
  }

  useEffect(() => {
    if (isOpen) {
      setCrop(INITIAL_CROP);
      setZoom(CROP_MIN_ZOOM);
      setIsSaving(false);
      setErrorKey('');
      areaRef.current = null;
    }
  }, [isOpen, imageUrl]);

  useEffect(() => {
    if (isOpen && isPresent) {
      confirmRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen, isPresent, imageUrl]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        trapFocus(event, panelRef.current);
        return;
      }
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!isSaving) {
          onCancel();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isSaving, onCancel]);

  if (!isPresent) {
    return null;
  }

  const image = isOpen ? imageUrl : lastImageRef.current;
  const exitClassName = isExiting ? ' is-exiting' : '';

  const handleConfirm = async () => {
    const area = areaRef.current;
    if (!area || isSaving) {
      return;
    }
    setIsSaving(true);
    setErrorKey('');
    try {
      await onConfirm({ x: area.x, y: area.y, width: area.width, height: area.height });
    } catch (error) {
      setErrorKey(profilePhotoErrorKey(error));
      setIsSaving(false);
    }
  };

  const zoomPercent = Math.round(((zoom - CROP_MIN_ZOOM) / (CROP_MAX_ZOOM - CROP_MIN_ZOOM)) * 100);

  return createPortal(
    <>
      <div
        className={`sc-modal-backdrop${exitClassName}`}
        style={{
          position: 'fixed',
          inset: 0,
          background: theme.overlay,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 10020,
        }}
        onClick={isSaving ? undefined : onCancel}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`sc-modal-panel${exitClassName}`}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10021,
          width: 'calc(100% - 32px)',
          maxWidth: '440px',
        }}
      >
        <div
          style={{
            background: theme.surfaceElevated,
            border: `1px solid ${theme.borderSubtle}`,
            borderRadius: '18px',
            boxShadow: theme.shadowLg,
            overflow: 'hidden',
            maxHeight: 'calc(var(--app-height, 100vh) - 32px)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '18px 20px 18px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              background: theme.gradient,
              boxShadow: theme.shadowSm,
              flexShrink: 0,
            }}
          >
            <h2 id={titleId} style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: theme.onGradient, letterSpacing: '-0.3px', textWrap: 'balance' }}>
              {t('profilePhotos.crop.title')}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              title={t('common.close')}
              aria-label={t('common.close')}
              className="sc-icon-btn sc-icon-btn--header"
              style={{ width: '34px', height: '34px', flexShrink: 0 }}
            >
              <FaTimes size={15} />
            </button>
          </div>

          <div style={{ padding: '20px clamp(16px, 5vw, 24px) 22px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <div className="sc-crop-stage sc-anim-rise-in sc-stagger" data-dragging={isDragging} style={staggerStyle(0)}>
              {image && (
                <Cropper
                  image={image}
                  crop={crop}
                  zoom={zoom}
                  minZoom={CROP_MIN_ZOOM}
                  maxZoom={CROP_MAX_ZOOM}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  zoomSpeed={0.4}
                  keyboardStep={8}
                  disableAutomaticStylesInjection
                  onCropChange={setCrop}
                  onZoomChange={(value) => setZoom(clampZoom(value))}
                  onCropComplete={(_area, pixels) => {
                    areaRef.current = pixels;
                  }}
                  onInteractionStart={() => setIsDragging(true)}
                  onInteractionEnd={() => setIsDragging(false)}
                  classes={{ cropAreaClassName: 'sc-crop-area', mediaClassName: 'sc-crop-media' }}
                  mediaProps={{ alt: '' }}
                  cropperProps={{ 'aria-describedby': hintId }}
                />
              )}
            </div>

            <p id={hintId} className="sc-anim-rise-in sc-stagger" style={{ ...staggerStyle(1), margin: 0, textAlign: 'center', fontSize: '0.82rem', color: theme.textSecondary, lineHeight: 1.45, textWrap: 'pretty' }}>
              {t('profilePhotos.crop.hint')}
            </p>

            <div className="sc-anim-rise-in sc-stagger" style={{ ...staggerStyle(2), display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setZoom((value) => clampZoom(value - CROP_ZOOM_STEP))}
                disabled={zoom <= CROP_MIN_ZOOM}
                title={t('profilePhotos.crop.zoomOut')}
                aria-label={t('profilePhotos.crop.zoomOut')}
                className="sc-icon-btn sc-icon-btn--soft"
                style={{ width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0 }}
              >
                <FaSearchMinus size={15} />
              </button>
              <input
                type="range"
                min={CROP_MIN_ZOOM}
                max={CROP_MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(event) => setZoom(clampZoom(Number(event.target.value)))}
                aria-label={t('profilePhotos.crop.zoom')}
                aria-valuetext={`${zoomPercent}%`}
                className="sc-range"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                onClick={() => setZoom((value) => clampZoom(value + CROP_ZOOM_STEP))}
                disabled={zoom >= CROP_MAX_ZOOM}
                title={t('profilePhotos.crop.zoomIn')}
                aria-label={t('profilePhotos.crop.zoomIn')}
                className="sc-icon-btn sc-icon-btn--soft"
                style={{ width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0 }}
              >
                <FaSearchPlus size={15} />
              </button>
            </div>

            {errorKey && (
              <small key={errorKey} role="alert" className="sc-anim-shake" style={{ color: theme.dangerText, fontWeight: 600, textAlign: 'center' }}>
                {t(errorKey)}
              </small>
            )}

            <div className="sc-anim-rise-in sc-stagger" style={{ ...staggerStyle(3), display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="button" onClick={onCancel} disabled={isSaving} className="sc-btn sc-btn--secondary" style={{ flex: '1 1 120px', padding: '12px 18px' }}>
                {t('common.cancel')}
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={() => void handleConfirm()}
                disabled={isSaving}
                className="sc-btn sc-btn--gradient sc-btn--lift"
                style={{ flex: '1 1 120px', padding: '12px 18px' }}
              >
                {isSaving ? <Spinner size={14} trackColor={withAlpha(theme.onGradient, 0.3)} accentColor={theme.onGradient} /> : <FaCheck size={14} />}
                {t('profilePhotos.crop.confirm')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
