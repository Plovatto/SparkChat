import type { ComponentProps } from 'react';
import { deferredUntilOpen } from '@lib/lazy/deferred-component';
import type { ForwardMessageModal as EagerForwardMessageModal } from './ForwardMessageModal';
import type { ImageModal as EagerImageModal } from './ImageModal';
import type { MediaViewer as EagerMediaViewer } from './media-viewer/MediaViewer';
import type { PdfPreviewModal as EagerPdfPreviewModal } from './PdfPreviewModal';
import type { RoomInfoPanel as EagerRoomInfoPanel } from './RoomInfoPanel';
import type { SafetyNumberDialog as EagerSafetyNumberDialog } from './SafetyNumberDialog';
import type { VideoPreviewModal as EagerVideoPreviewModal } from './VideoPreviewModal';

export const ForwardMessageModal = deferredUntilOpen<ComponentProps<typeof EagerForwardMessageModal>>(() =>
  import('./ForwardMessageModal').then((module) => module.ForwardMessageModal),
);

export const RoomInfoPanel = deferredUntilOpen<ComponentProps<typeof EagerRoomInfoPanel>>(() =>
  import('./RoomInfoPanel').then((module) => module.RoomInfoPanel),
);

export const MediaViewer = deferredUntilOpen<ComponentProps<typeof EagerMediaViewer>>(() =>
  import('./media-viewer/MediaViewer').then((module) => module.MediaViewer),
);

export const ImageModal = deferredUntilOpen<ComponentProps<typeof EagerImageModal>>(() => import('./ImageModal').then((module) => module.ImageModal));

export const VideoPreviewModal = deferredUntilOpen<ComponentProps<typeof EagerVideoPreviewModal>>(() =>
  import('./VideoPreviewModal').then((module) => module.VideoPreviewModal),
);

export const PdfPreviewModal = deferredUntilOpen<ComponentProps<typeof EagerPdfPreviewModal>>(() =>
  import('./PdfPreviewModal').then((module) => module.PdfPreviewModal),
);

export const SafetyNumberDialog = deferredUntilOpen<ComponentProps<typeof EagerSafetyNumberDialog>>(() =>
  import('./SafetyNumberDialog').then((module) => module.SafetyNumberDialog),
);

export const CHAT_PANEL_PRELOADS = [
  RoomInfoPanel.preload,
  MediaViewer.preload,
  ForwardMessageModal.preload,
  ImageModal.preload,
  VideoPreviewModal.preload,
  PdfPreviewModal.preload,
  SafetyNumberDialog.preload,
];
