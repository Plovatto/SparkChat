import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MOTION_DURATION_MS } from '@features/motion';
import { useAutoDismiss } from '@hooks/useAutoDismiss';
import { compressProfilePhoto, decodeProfilePhoto, profilePhotoErrorKey, type PhotoCropArea } from '@lib/media/profile-photo-compression';
import { PhotoCropModal } from '../components/PhotoCropModal';

export const PROFILE_PHOTO_ACCEPT = 'image/*';

interface PhotoSource {
  file: Blob;
  url: string;
}

export interface PhotoPicker {
  open: () => void;
  error: string;
  clearError: () => void;
  isPreparing: boolean;
  element: ReactNode;
}

export function usePhotoPicker(onPicked: (photo: Blob) => void): PhotoPicker {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<PhotoSource | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState('');
  useAutoDismiss(error, setError);

  const sourceUrl = source?.url;
  useEffect(() => {
    if (!sourceUrl) {
      return;
    }
    return () => {
      window.setTimeout(() => URL.revokeObjectURL(sourceUrl), MOTION_DURATION_MS.slower);
    };
  }, [sourceUrl]);

  const open = useCallback(() => {
    setError('');
    inputRef.current?.click();
  }, []);

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setIsPreparing(true);
    try {
      const bitmap = await decodeProfilePhoto(file);
      bitmap.close();
      setSource({ file, url: URL.createObjectURL(file) });
      setIsCropOpen(true);
    } catch (caught) {
      setError(t(profilePhotoErrorKey(caught)));
    } finally {
      setIsPreparing(false);
    }
  };

  const handleCancel = useCallback(() => setIsCropOpen(false), []);

  const handleConfirm = async (area: PhotoCropArea) => {
    if (!source) {
      return;
    }
    const photo = await compressProfilePhoto(source.file, area);
    setIsCropOpen(false);
    onPicked(photo);
  };

  const element = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={PROFILE_PHOTO_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        style={{ display: 'none' }}
        onChange={(event) => void handleChange(event)}
      />
      <PhotoCropModal isOpen={isCropOpen} imageUrl={source?.url ?? null} onCancel={handleCancel} onConfirm={handleConfirm} />
    </>
  );

  return {
    open,
    error,
    clearError: () => setError(''),
    isPreparing,
    element,
  };
}
