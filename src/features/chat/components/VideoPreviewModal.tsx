import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { FaDownload, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { OverlayIconButton } from '@components/common/OverlayIconButton';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useBackdropDismiss } from '@hooks/useBackdropDismiss';
import { useBackLayer } from '@hooks/useBackLayer';
import { useBodyScrollLock } from '@hooks/useBodyScrollLock';
import { useEscapeKey } from '@hooks/useEscapeKey';
import { downloadMessageMedia } from '@lib/e2ee';
import type { MessageFileMeta } from '@lib/socket';
import { toLocalMediaUrl } from '../utils/safe-media-url';
import {
  MEDIA_VIEWER_BACKDROP_STYLE,
  MEDIA_VIEWER_CHROME_STYLE,
  MEDIA_VIEWER_CONTENT_SHADOW,
  MEDIA_VIEWER_DIVIDER_STYLE,
  MEDIA_VIEWER_VIDEO_BACKGROUND,
} from './media-viewer-styles';

interface VideoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  fileName: string;
  roomId?: string;
  messageId?: string;
  fileMeta?: MessageFileMeta | null;
}

export function VideoPreviewModal({ isOpen, onClose, url, fileName, roomId, messageId, fileMeta }: VideoPreviewModalProps) {
  const { t } = useTranslation();
  const { isPresent, isExiting } = usePresence(isOpen, MOTION_DURATION_MS.fast);
  const lastSourceRef = useRef({ url, fileName, roomId, messageId, fileMeta });
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);
  useBackLayer(isOpen, onClose);
  const backdropDismissProps = useBackdropDismiss(onClose);

  if (isOpen && url) {
    lastSourceRef.current = { url, fileName, roomId, messageId, fileMeta };
  }

  if (!isPresent) {
    return null;
  }

  const source = isOpen && url ? { url, fileName, roomId, messageId, fileMeta } : lastSourceRef.current;
  const chromeClassName = isExiting ? 'sc-anim-fade-out' : 'sc-anim-media-chrome-in';

  return createPortal(
    <>
      <div className={`sc-modal-backdrop${isExiting ? ' is-exiting' : ''}`} style={MEDIA_VIEWER_BACKDROP_STYLE} {...backdropDismissProps} />

      <div
        {...backdropDismissProps}
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
          <OverlayIconButton
            onClick={() =>
              void downloadMessageMedia({
                content: source.url,
                roomId: source.roomId,
                messageId: source.messageId,
                fileMeta: source.fileMeta,
                fileName: source.fileName,
                messageType: 'file',
              })
            }
            title={t('chat.viewer.downloadVideo')}
          >
            <FaDownload />
          </OverlayIconButton>

          <div style={MEDIA_VIEWER_DIVIDER_STYLE} />

          <OverlayIconButton onClick={onClose} title={t('chat.viewer.closeVideo')} variant="danger">
            <FaTimes />
          </OverlayIconButton>
        </div>

        <div
          className={chromeClassName}
          style={{
            ...MEDIA_VIEWER_CHROME_STYLE,
            position: 'absolute',
            top: 'max(16px, env(safe-area-inset-top))',
            left: 'max(16px, env(safe-area-inset-left))',
            maxWidth: 'calc(100vw - 140px)',
            zIndex: 10055,
            boxShadow: 'none',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {source.fileName}
        </div>

        <div
          className={isExiting ? 'sc-anim-media-content-out' : 'sc-anim-media-content-in'}
          style={{
            position: 'relative',
            maxHeight: '92vh',
            maxWidth: '96vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <video
            src={toLocalMediaUrl(source.url)}
            controls
            autoPlay
            style={{
              maxHeight: '92vh',
              maxWidth: '96vw',
              display: 'block',
              borderRadius: '16px',
              boxShadow: MEDIA_VIEWER_CONTENT_SHADOW,
              background: MEDIA_VIEWER_VIDEO_BACKGROUND,
            }}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
