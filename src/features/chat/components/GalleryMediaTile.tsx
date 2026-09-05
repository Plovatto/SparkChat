import { useEffect, useState, type CSSProperties } from 'react';
import { FaPlay } from 'react-icons/fa';
import { useTheme, withAlpha } from '@features/theme';
import type { MessageView } from '@lib/socket';
import { getFileTypeIcon } from '../utils/get-file-type-icon';
import { renderPdfThumbnail } from '../utils/render-pdf-thumbnail';
import { renderVideoThumbnail } from '../utils/render-video-thumbnail';

const GALLERY_TILE_RENDER_WIDTH = 240;

interface GalleryMediaTileProps {
  message: MessageView;
}

export function GalleryMediaTile({ message }: GalleryMediaTileProps) {
  const { theme } = useTheme();
  const [isLoaded, setIsLoaded] = useState(false);
  const [generatedThumbnail, setGeneratedThumbnail] = useState<string | null>(null);
  const isImage = message.type === 'image';
  const isVideo = message.type === 'file' && Boolean(message.fileMeta?.mimeType.startsWith('video/'));
  const isPdf = message.type === 'file' && message.fileMeta?.mimeType === 'application/pdf';

  useEffect(() => {
    if (!isVideo) {
      return;
    }

    let cancelled = false;
    renderVideoThumbnail(message.content, GALLERY_TILE_RENDER_WIDTH)
      .then((thumbnail) => {
        if (!cancelled) {
          setGeneratedThumbnail(thumbnail.dataUrl);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isVideo, message.content]);

  useEffect(() => {
    if (!isPdf) {
      return;
    }

    let cancelled = false;
    renderPdfThumbnail(message.content, GALLERY_TILE_RENDER_WIDTH)
      .then((thumbnail) => {
        if (!cancelled) {
          setGeneratedThumbnail(thumbnail.dataUrl);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isPdf, message.content]);

  const thumbnailSrc = isImage ? message.content : generatedThumbnail;

  if (thumbnailSrc) {
    return (
      <>
        {!isLoaded && (
          <div
            className="shimmer-bg"
            style={
              {
                position: 'absolute',
                inset: 0,
                '--shimmer-a': theme.skeleton,
              } as CSSProperties
            }
          />
        )}
        <img
          src={thumbnailSrc}
          alt="Mídia"
          onLoad={() => setIsLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity var(--sc-dur-normal) var(--sc-ease-standard)',
          }}
        />
        {isVideo && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.2)',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: theme.scrim,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FaPlay size={11} color={theme.onScrim} style={{ marginLeft: 2 }} />
            </div>
          </div>
        )}
      </>
    );
  }

  const fileIcon = getFileTypeIcon(message.fileMeta?.mimeType ?? '');
  const FileIcon = fileIcon.icon;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        background: withAlpha(fileIcon.color, 0.12),
        padding: '8px',
        boxSizing: 'border-box',
      }}
    >
      <FileIcon size={24} color={fileIcon.color} />
      <span
        style={{
          fontSize: '0.62rem',
          color: theme.textSecondary,
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          wordBreak: 'break-word',
          width: '100%',
        }}
      >
        {message.fileMeta?.name ?? fileIcon.label}
      </span>
    </div>
  );
}
