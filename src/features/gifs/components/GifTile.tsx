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

const GIF_STAGGER_WINDOW = 24;

interface GifTileProps {
  item: GifItem;
  index: number;
  auth: SessionAuth;
  scrollRoot: Element | null;
  isFocusTarget: boolean;
  isPicked?: boolean;
  onPick: (item: GifItem, displayedBlob: Blob | null) => void;
  onKeyNavigate: (index: number, event: KeyboardEvent<HTMLButtonElement>) => void;
  registerTile: (index: number, element: HTMLButtonElement | null) => void;
}

export const GifTile = memo(function GifTile({ item, index, auth, scrollRoot, isFocusTarget, isPicked = false, onPick, onKeyNavigate, registerTile }: GifTileProps) {
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
    <div
      ref={wrapperRef}
      className="sc-anim-tile-in sc-stagger"
      style={
        {
          position: 'relative',
          width: '100%',
          aspectRatio: `1 / ${tileAspectRatio(item)}`,
          '--sc-stagger-index': index % GIF_STAGGER_WINDOW,
          '--sc-stagger-step': '28ms',
        } as CSSProperties
      }
    >
      <button
        ref={(element) => registerTile(index, element)}
        type="button"
        data-testid="gif-tile"
        data-gif-id={item.id}
        data-loaded={entry ? 'true' : 'false'}
        data-shown={isShown ? 'true' : 'false'}
        data-picked={isPicked ? 'true' : undefined}
        aria-label={label}
        aria-disabled={isShown ? undefined : true}
        title={label}
        tabIndex={isFocusTarget ? 0 : -1}
        onClick={() => onPick(item, pickDisplayedGif(entry, isShown))}
        onKeyDown={(event) => onKeyNavigate(index, event)}
        className={isShown || failed ? 'sc-gif-tile' : 'sc-gif-tile shimmer-bg'}
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
            className="sc-gif-reveal"
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </button>
    </div>
  );
});
