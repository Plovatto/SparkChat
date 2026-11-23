import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaViewer } from '@features/chat/components/lazy-panels';
import type { MediaViewerItem } from '@features/chat/components/media-viewer/media-viewer-items';

interface ProfilePhotoViewerProps {
  photoUrl: string | null;
  onClose: () => void;
}

export function ProfilePhotoViewer({ photoUrl, onClose }: ProfilePhotoViewerProps) {
  const { t } = useTranslation();
  const title = t('profilePhotos.viewerTitle');
  const downloadName = t('profilePhotos.downloadName');
  const items = useMemo<MediaViewerItem[]>(
    () =>
      photoUrl
        ? [
            {
              id: `profile-photo-${photoUrl}`,
              kind: 'image',
              content: photoUrl,
              roomId: '',
              fileMeta: null,
              caption: null,
              senderId: '',
              senderName: title,
              senderAvatar: undefined,
              timestamp: '',
              isGif: false,
              directUrl: photoUrl,
              downloadName,
            },
          ]
        : [],
    [photoUrl, title, downloadName],
  );

  return <MediaViewer isOpen={photoUrl !== null} items={items} startIndex={0} onClose={onClose} />;
}
