import { useEffect, useState } from 'react';
import { renderVideoThumbnail } from '../utils/render-video-thumbnail';

export function useReplyVideoThumbnail(isVideo: boolean, content: string | undefined): string | null {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isVideo || !content) {
      return;
    }

    let cancelled = false;
    renderVideoThumbnail(content, 80)
      .then((thumbnail) => {
        if (!cancelled) {
          setThumbnailUrl(thumbnail.dataUrl);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isVideo, content]);

  return thumbnailUrl;
}
