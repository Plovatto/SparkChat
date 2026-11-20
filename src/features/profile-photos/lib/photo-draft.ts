export interface PendingPhoto {
  blob: Blob;
  url: string;
}

export interface PhotoDraft {
  pending: PendingPhoto | null;
  currentDismissed: boolean;
  selection: 'auto' | 'photo' | 'preset';
}

export type PhotoDraftAction =
  | { type: 'pick'; photo: PendingPhoto }
  | { type: 'selectPhoto' }
  | { type: 'selectPreset' }
  | { type: 'remove' }
  | { type: 'reset' };

export type PhotoSaveAction = 'upload' | 'remove' | 'none';

export const INITIAL_PHOTO_DRAFT: PhotoDraft = { pending: null, currentDismissed: false, selection: 'auto' };

export function photoDraftReducer(draft: PhotoDraft, action: PhotoDraftAction): PhotoDraft {
  switch (action.type) {
    case 'pick':
      return { pending: action.photo, currentDismissed: draft.currentDismissed, selection: 'photo' };
    case 'selectPhoto':
      return { ...draft, selection: 'photo' };
    case 'selectPreset':
      return { ...draft, selection: 'preset' };
    case 'remove':
      return { pending: null, currentDismissed: true, selection: 'preset' };
    case 'reset':
      return INITIAL_PHOTO_DRAFT;
  }
}

export function displayedPhoto(draft: PhotoDraft, currentUrl: string | null): string | null {
  if (draft.pending) {
    return draft.pending.url;
  }
  return draft.currentDismissed ? null : currentUrl;
}

export function isPhotoSelected(draft: PhotoDraft, currentUrl: string | null): boolean {
  if (displayedPhoto(draft, currentUrl) === null) {
    return false;
  }
  return draft.selection === 'photo' || (draft.selection === 'auto' && currentUrl !== null);
}

export function photoSaveAction(draft: PhotoDraft, currentUrl: string | null): PhotoSaveAction {
  const selected = isPhotoSelected(draft, currentUrl);
  if (selected && draft.pending) {
    return 'upload';
  }
  if (!selected && currentUrl !== null) {
    return 'remove';
  }
  return 'none';
}
