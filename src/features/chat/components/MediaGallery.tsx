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

  const mediaMessages = messages.filter(
    (message) => (message.type === 'image' || message.type === 'file') && !message.deletedForEveryone,
  );

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
                  '--shimmer-a': theme.surfaceLight,
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
          background: theme.background,
          borderRadius: '10px',
          border: `1px dashed ${theme.border}`,
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
        {visibleMessages.map((message) => (
          <div
            key={message.id}
            onClick={() => onSelectMedia(message)}
            style={{
              aspectRatio: '1',
              borderRadius: '10px',
              overflow: 'hidden',
              cursor: 'pointer',
              border: `2px solid ${theme.border}`,
              transition: 'all 0.3s',
              position: 'relative',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.borderColor = theme.primary;
              event.currentTarget.style.transform = 'scale(1.05)';
              event.currentTarget.style.boxShadow = `0 6px 16px ${theme.primary}40`;
              event.currentTarget.style.zIndex = '10';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.borderColor = theme.border;
              event.currentTarget.style.transform = 'scale(1)';
              event.currentTarget.style.boxShadow = 'none';
              event.currentTarget.style.zIndex = '1';
            }}
          >
            <GalleryMediaTile message={message} theme={theme} />
          </div>
        ))}
      </div>
      {mediaMessages.length > columns && (
        <button
          onClick={() => setShowAll((previous) => !previous)}
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '12px',
            background: `${theme.primary}18`,
            border: 'none',
            color: theme.primary,
            borderRadius: '10px',
            padding: '9px 16px',
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 700,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = `${theme.primary}28`;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = `${theme.primary}18`;
          }}
        >
          {showAll ? 'Ver menos' : `Ver todas (${mediaMessages.length})`}
        </button>
      )}
    </div>
  );
}
