import { useTranslation } from 'react-i18next';
import { ImageModal } from '@features/chat/components/ImageModal';

interface ProfilePhotoViewerProps {
  photoUrl: string | null;
  onClose: () => void;
}

export function ProfilePhotoViewer({ photoUrl, onClose }: ProfilePhotoViewerProps) {
  const { t } = useTranslation();

  return <ImageModal isOpen={photoUrl !== null} images={photoUrl ? [photoUrl] : []} fileNames={[t('profilePhotos.downloadName')]} onClose={onClose} />;
}
