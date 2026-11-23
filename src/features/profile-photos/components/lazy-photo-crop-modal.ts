import type { ComponentProps } from 'react';
import { deferredUntilOpen } from '@lib/lazy/deferred-component';
import type { PhotoCropModal as EagerPhotoCropModal } from './PhotoCropModal';

export const PhotoCropModal = deferredUntilOpen<ComponentProps<typeof EagerPhotoCropModal>>(() =>
  import('./PhotoCropModal').then((module) => module.PhotoCropModal),
);
