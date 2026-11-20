import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { INITIAL_PHOTO_DRAFT, displayedPhoto, isPhotoSelected, photoDraftReducer, photoSaveAction, type PhotoDraft, type PhotoSaveAction } from '../lib/photo-draft';

export interface PhotoDraftControls {
  draft: PhotoDraft;
  photoUrl: string | null;
  isSelected: boolean;
  saveAction: PhotoSaveAction;
  pendingBlob: Blob | null;
  pick: (blob: Blob) => void;
  selectPhoto: () => void;
  selectPreset: () => void;
  remove: () => void;
  reset: () => void;
}

export function usePhotoDraft(currentUrl: string | null): PhotoDraftControls {
  const [draft, dispatch] = useReducer(photoDraftReducer, INITIAL_PHOTO_DRAFT);
  const pendingUrl = draft.pending?.url;

  useEffect(() => {
    if (!pendingUrl) {
      return;
    }
    return () => URL.revokeObjectURL(pendingUrl);
  }, [pendingUrl]);

  const pick = useCallback((blob: Blob) => dispatch({ type: 'pick', photo: { blob, url: URL.createObjectURL(blob) } }), []);
  const selectPhoto = useCallback(() => dispatch({ type: 'selectPhoto' }), []);
  const selectPreset = useCallback(() => dispatch({ type: 'selectPreset' }), []);
  const remove = useCallback(() => dispatch({ type: 'remove' }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  return useMemo(
    () => ({
      draft,
      photoUrl: displayedPhoto(draft, currentUrl),
      isSelected: isPhotoSelected(draft, currentUrl),
      saveAction: photoSaveAction(draft, currentUrl),
      pendingBlob: draft.pending?.blob ?? null,
      pick,
      selectPhoto,
      selectPreset,
      remove,
      reset,
    }),
    [draft, currentUrl, pick, selectPhoto, selectPreset, remove, reset],
  );
}
