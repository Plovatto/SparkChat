import { memo, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@features/theme';
import type { GifItem } from '@lib/api/gifs';
import type { SessionAuth } from '@lib/api/session-auth';
import { useGifMedia } from '../hooks/useGifMedia';
import { useVisibleOnce } from '../hooks/useVisibleOnce';
import { tileAspectRatio } from '../utils/masonry-layout';

interface GifTileProps {
  item: GifItem;
  index: number;
  auth: SessionAuth;
  scrollRoot: Element | null;
  isFocusTarget: boolean;
  onPick: (item: GifItem) => void;
  onKeyNavigate: (index: number, event: KeyboardEvent<HTMLButtonElement>) => void;
  registerTile: (index: number, element: HTMLButtonElement | null) => void;
}

export const GifTile = memo(function GifTile({ item, index, auth, scrollRoot, isFocusTarget, onPick, onKeyNavigate, registerTile }: GifTileProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isVisible = useVisibleOnce(wrapperRef, scrollRoot);
  const { entry, failed } = useGifMedia(item.url, auth, isVisible);
  const label = item.title.trim() || t('gifs.untitled');

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', aspectRatio: `1 / ${tileAspectRatio(item)}` }}>
      <button
        ref={(element) => registerTile(index, element)}
        type="button"
        data-testid="gif-tile"
        data-gif-id={item.id}
        data-loaded={entry ? 'true' : 'false'}
        aria-label={label}
        aria-disabled={entry ? undefined : true}
        title={label}
        tabIndex={isFocusTarget ? 0 : -1}
        onClick={() => onPick(item)}
        onKeyDown={(event) => onKeyNavigate(index, event)}
        className={entry ? 'sc-media-thumb' : failed ? undefined : 'shimmer-bg'}
        style={
          {
            position: 'absolute',
            inset: 0,
            padding: 0,
            border: 'none',
            borderRadius: '10px',
            overflow: 'hidden',
            cursor: entry ? 'pointer' : 'default',
            background: theme.skeleton,
            '--shimmer-a': theme.skeleton,
          } as CSSProperties
        }
      >
        {entry && (
          <img
            src={entry.objectUrl}
            alt=""
            draggable={false}
            className="sc-anim-fade-in"
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </button>
    </div>
  );
});
