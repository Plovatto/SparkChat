import { describe, expect, it } from 'vitest';
import { INITIAL_PHOTO_DRAFT, displayedPhoto, isPhotoSelected, photoDraftReducer, photoSaveAction, type PhotoDraft } from './photo-draft';

const CURRENT = 'blob:current';
const pending = { blob: new Blob(['x'], { type: 'image/webp' }), url: 'blob:new' };

function apply(...actions: Parameters<typeof photoDraftReducer>[1][]): PhotoDraft {
  return actions.reduce(photoDraftReducer, INITIAL_PHOTO_DRAFT);
}

describe('photo draft', () => {
  it('selects the existing photo automatically and has nothing to save', () => {
    expect(isPhotoSelected(INITIAL_PHOTO_DRAFT, CURRENT)).toBe(true);
    expect(isPhotoSelected(INITIAL_PHOTO_DRAFT, null)).toBe(false);
    expect(photoSaveAction(INITIAL_PHOTO_DRAFT, CURRENT)).toBe('none');
    expect(photoSaveAction(INITIAL_PHOTO_DRAFT, null)).toBe('none');
  });

  it('uploads a newly picked photo', () => {
    const draft = apply({ type: 'pick', photo: pending });
    expect(displayedPhoto(draft, CURRENT)).toBe('blob:new');
    expect(isPhotoSelected(draft, null)).toBe(true);
    expect(photoSaveAction(draft, null)).toBe('upload');
    expect(photoSaveAction(draft, CURRENT)).toBe('upload');
  });

  it('removes the current photo when a preset is chosen but keeps it visible to re-select', () => {
    const draft = apply({ type: 'selectPreset' });
    expect(displayedPhoto(draft, CURRENT)).toBe(CURRENT);
    expect(isPhotoSelected(draft, CURRENT)).toBe(false);
    expect(photoSaveAction(draft, CURRENT)).toBe('remove');
    expect(photoSaveAction(photoDraftReducer(draft, { type: 'selectPhoto' }), CURRENT)).toBe('none');
  });

  it('does nothing when a new photo is picked and then a preset is chosen without a current photo', () => {
    const draft = apply({ type: 'pick', photo: pending }, { type: 'selectPreset' });
    expect(photoSaveAction(draft, null)).toBe('none');
    expect(displayedPhoto(draft, null)).toBe('blob:new');
  });

  it('clears both the pending and the current photo on remove', () => {
    const draft = apply({ type: 'pick', photo: pending }, { type: 'remove' });
    expect(displayedPhoto(draft, CURRENT)).toBeNull();
    expect(isPhotoSelected(draft, CURRENT)).toBe(false);
    expect(photoSaveAction(draft, CURRENT)).toBe('remove');
    expect(photoSaveAction(draft, null)).toBe('none');
  });

  it('cannot select a photo that is not there', () => {
    expect(isPhotoSelected(apply({ type: 'selectPhoto' }), null)).toBe(false);
  });

  it('resets to the initial state', () => {
    expect(apply({ type: 'pick', photo: pending }, { type: 'reset' })).toEqual(INITIAL_PHOTO_DRAFT);
  });
});
