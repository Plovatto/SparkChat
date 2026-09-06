import { useState, type CSSProperties } from 'react';
import { FaImage } from 'react-icons/fa';
import { minWidthQuery, WIDE_GALLERY_MIN_WIDTH_PX } from '@constants/breakpoints';
import { useTheme } from '@features/theme';
import { useMediaQuery } from '@hooks/useMediaQuery';
import type { MessageView } from '@lib/socket';
import { GalleryMediaTile } from './GalleryMediaTile';

interface MediaGalleryProps {
  messages: MessageView[];
  messagesLoaded: boolean;
  onSelectMedia: (message: MessageView) => void;
}

const WIDE_COLUMNS = 4;
const NARROW_COLUMNS = 3;

export function MediaGallery({ messages, messagesLoaded, onSelectMedia }: MediaGalleryProps) {
  const { theme } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const isWide = useMediaQuery(minWidthQuery(WIDE_GALLERY_MIN_WIDTH_PX));
  const columns = isWide ? WIDE_COLUMNS : NARROW_COLUMNS;

  const mediaMessages = messages
    .filter((message) => (message.type === 'image' || message.type === 'file') && !message.deletedForEveryone)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (!messagesLoaded) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '10px', padding: '3px' }}>
        {Array.from({ length: columns }).map((_, index) => (
          <div key={index} style={{ position: 'relative', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden' }}>
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
          </div>
        ))}
      </div>
    );
  }

  if (mediaMessages.length === 0) {
    return (
      <div
        style={{
          padding: '20px',
          textAlign: 'center',
          color: theme.textSecondary,
          background: theme.surfaceSunken,
          borderRadius: '10px',
          border: `1px dashed ${theme.borderStrong}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <FaImage size={30} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: '0.9rem' }}>Nenhuma mídia compartilhada</div>
      </div>
    );
  }

  const visibleMessages = showAll ? mediaMessages : mediaMessages.slice(0, columns);

  return (
    <div>
      <div
        style={{
          fontSize: '0.85rem',
          color: theme.textSecondary,
          marginBottom: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <FaImage /> Mídias ({mediaMessages.length})
      </div>
      <div
        className="sc-media-gallery-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: '10px',
          padding: '3px',
          maxHeight: showAll ? '300px' : 'none',
          overflowY: showAll ? 'auto' : 'visible',
          overflowX: 'hidden',
        }}
      >
        {visibleMessages.map((message, index) => (
          <div
            key={message.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectMedia(message)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectMedia(message);
              }
            }}
            className="sc-tile sc-anim-pop-in sc-stagger"
            style={
              {
                aspectRatio: '1',
                borderRadius: '10px',
                overflow: 'hidden',
                background: theme.surfaceSunken,
                '--sc-stagger-index': Math.min(index, columns * 2),
                '--sc-stagger-step': '25ms',
              } as CSSProperties
            }
          >
            <GalleryMediaTile message={message} />
          </div>
        ))}
      </div>
      {mediaMessages.length > columns && (
        <button
          onClick={() => setShowAll((previous) => !previous)}
          className="sc-btn sc-btn--soft"
          style={{ width: '100%', marginTop: '12px', gap: '6px', padding: '9px 16px', fontSize: '0.82rem', fontWeight: 700 }}
        >
          {showAll ? 'Ver menos' : `Ver todas (${mediaMessages.length})`}
        </button>
      )}
    </div>
  );
}
