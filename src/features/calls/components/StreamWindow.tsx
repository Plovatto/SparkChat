import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FaExpand } from 'react-icons/fa';
import { useStreamOn } from './call-hooks';

interface StreamWindowProps {
  target: Window;
  stream: MediaStream;
  title: string;
  onFullscreen: () => void;
}

export function StreamWindow({ target, stream, title, onFullscreen }: StreamWindowProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  useStreamOn(videoRef, stream);

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#0b0b10', color: '#ffffff', fontFamily: 'system-ui, sans-serif' }}>
      <video ref={videoRef} autoPlay playsInline muted aria-label={title} style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'contain', background: '#000000' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'rgba(12, 12, 20, 0.85)' }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: 600 }}>{title}</span>
        <button type="button" className="sc-stage-icon" onClick={onFullscreen} title={t('calls.share.fullscreen')} aria-label={t('calls.share.fullscreen')}>
          <FaExpand size={14} />
        </button>
      </div>
    </div>,
    target.document.body,
  );
}
