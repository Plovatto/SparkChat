import { useEffect, useState } from 'react';
import { FaPlay, FaTimes } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { formatFileSize } from '@lib/format';
import { getAttachmentKind } from '../utils/get-attachment-kind';
import { getFileTypeIcon } from '../utils/get-file-type-icon';
import { renderPdfThumbnail } from '../utils/render-pdf-thumbnail';
import { renderVideoThumbnail } from '../utils/render-video-thumbnail';
import { ImageModal } from './ImageModal';
import { PdfPreviewModal } from './PdfPreviewModal';
import { VideoPreviewModal } from './VideoPreviewModal';

interface PendingAttachmentTileProps {
  file: File;
  onRemove?: () => void;
}

const PENDING_ATTACHMENT_TILE_SIZE = 76;

export function PendingAttachmentTile({ file, onRemove }: PendingAttachmentTileProps) {
  const { theme } = useTheme();
  const kind = getAttachmentKind(file.type);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const { icon: FileIcon, color } = getFileTypeIcon(file.type);
  const canPreview = kind === 'image' || kind === 'video' || kind === 'pdf';

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setThumbnailUrl(kind === 'image' ? url : null);

    let cancelled = false;
    if (kind === 'video') {
      renderVideoThumbnail(url, PENDING_ATTACHMENT_TILE_SIZE * 2)
        .then((thumbnail) => {
          if (!cancelled) {
            setThumbnailUrl(thumbnail.dataUrl);
          }
        })
        .catch(() => undefined);
    } else if (kind === 'pdf') {
      renderPdfThumbnail(url, PENDING_ATTACHMENT_TILE_SIZE * 2)
        .then((thumbnail) => {
          if (!cancelled) {
            setThumbnailUrl(thumbnail.dataUrl);
          }
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file, kind]);

  return (
    <div style={{ width: PENDING_ATTACHMENT_TILE_SIZE, flexShrink: 0 }}>
      <div style={{ position: 'relative' }}>
        <div
          onClick={() => canPreview && setIsPreviewOpen(true)}
          role={canPreview ? 'button' : undefined}
          tabIndex={canPreview ? 0 : undefined}
          className={canPreview ? 'sc-tile' : undefined}
          style={{
            position: 'relative',
            width: PENDING_ATTACHMENT_TILE_SIZE,
            height: PENDING_ATTACHMENT_TILE_SIZE,
            borderRadius: 10,
            overflow: 'hidden',
            background: theme.surfaceElevated,
            border: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: canPreview ? 'pointer' : 'default',
          }}
        >
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <FileIcon size={26} color={color} />
          )}
          {kind === 'video' && thumbnailUrl && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.25)',
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: theme.scrim,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FaPlay size={10} color={theme.onScrim} style={{ marginLeft: 2 }} />
              </div>
            </div>
          )}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            title="Remover"
            className="sc-icon-btn sc-icon-btn--danger"
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              width: 20,
              height: 20,
              border: `2px solid ${theme.surfaceElevated}`,
            }}
          >
            <FaTimes size={9} />
          </button>
        )}
      </div>
      <div
        title={`${file.name} · ${formatFileSize(file.size)}`}
        style={{
          fontSize: '0.65rem',
          color: theme.textSecondary,
          marginTop: '4px',
          width: PENDING_ATTACHMENT_TILE_SIZE,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        {file.name}
      </div>

      {kind === 'image' && objectUrl && (
        <ImageModal isOpen={isPreviewOpen} images={[objectUrl]} fileNames={[file.name]} onClose={() => setIsPreviewOpen(false)} />
      )}
      {kind === 'video' && objectUrl && (
        <VideoPreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} url={objectUrl} fileName={file.name} />
      )}
      {kind === 'pdf' && objectUrl && (
        <PdfPreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} url={objectUrl} fileName={file.name} />
      )}
    </div>
  );
}
