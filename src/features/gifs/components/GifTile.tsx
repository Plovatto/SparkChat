import { memo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@features/theme';
import type { GifItem } from '@lib/api/gifs';
import type { SessionAuth } from '@lib/api/session-auth';
import { useGifMedia } from '../hooks/useGifMedia';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { useVisibleOnce } from '../hooks/useVisibleOnce';
import { pickDisplayedGif } from '../utils/gif-media-cache';
import { tileAspectRatio } from '../utils/masonry-layout';

interface GifTileProps {
  item: GifItem;
  index: number;
  auth: SessionAuth;
  scrollRoot: Element | null;
  isFocusTarget: boolean;
  onPick: (item: GifItem, displayedBlob: Blob | null) => void;
  onKeyNavigate: (index: number, event: KeyboardEvent<HTMLButtonElement>) => void;
  registerTile: (index: number, element: HTMLButtonElement | null) => void;
}

export const GifTile = memo(function GifTile({ item, index, auth, scrollRoot, isFocusTarget, onPick, onKeyNavigate, registerTile }: GifTileProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isVisible = useVisibleOnce(wrapperRef, scrollRoot);
  const { entry, failed } = useGifMedia(item.url, auth, isVisible);
  const objectUrl = useObjectUrl(entry?.blob ?? null);
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  const isShown = objectUrl !== null && shownUrl === objectUrl;
  const label = item.title.trim() || t('gifs.untitled');

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', aspectRatio: `1 / ${tileAspectRatio(item)}` }}>
      <button
        ref={(element) => registerTile(index, element)}
        type="button"
        data-testid="gif-tile"
        data-gif-id={item.id}
        data-loaded={entry ? 'true' : 'false'}
        data-shown={isShown ? 'true' : 'false'}
        aria-label={label}
        aria-disabled={isShown ? undefined : true}
        title={label}
        tabIndex={isFocusTarget ? 0 : -1}
        onClick={() => onPick(item, pickDisplayedGif(entry, isShown))}
        onKeyDown={(event) => onKeyNavigate(index, event)}
        className={isShown ? 'sc-media-thumb' : failed ? undefined : 'shimmer-bg'}
        style={
          {
            position: 'absolute',
            inset: 0,
            padding: 0,
            border: 'none',
            borderRadius: '10px',
            overflow: 'hidden',
            cursor: isShown ? 'pointer' : 'default',
            background: theme.skeleton,
            '--shimmer-a': theme.skeleton,
          } as CSSProperties
        }
      >
        {objectUrl && (
          <img
            src={objectUrl}
            alt=""
            draggable={false}
            onLoad={() => setShownUrl(objectUrl)}
            className="sc-anim-fade-in"
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </button>
    </div>
  );
});
