import { useEffect } from 'react';
import { BASE_FAVICON_HREF, drawBadgedFavicon } from '../utils/draw-badged-favicon';

const BASE_TITLE = 'SparkChat';

function getFaviconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}

export function useUnreadBadge(totalUnread: number): void {
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? '99+' : totalUnread}) ${BASE_TITLE}` : BASE_TITLE;

    const link = getFaviconLink();

    if (totalUnread > 0) {
      drawBadgedFavicon(totalUnread)
        .then((dataUrl) => {
          link.type = 'image/png';
          link.href = dataUrl;
        })
        .catch(() => undefined);
    } else {
      link.type = 'image/svg+xml';
      link.href = BASE_FAVICON_HREF;
    }
  }, [totalUnread]);

  useEffect(() => {
    return () => {
      document.title = BASE_TITLE;
      const link = getFaviconLink();
      link.type = 'image/svg+xml';
      link.href = BASE_FAVICON_HREF;
    };
  }, []);
}
