import { CHAT_PANEL_PRELOADS } from '@features/chat/components/lazy-panels';
import { GifPanel } from '@features/gifs/components/lazy-gif-panel';
import { PhotoCropModal } from '@features/profile-photos/components/lazy-photo-crop-modal';
import { EditProfileModal, NewChatModal } from '@features/rooms/components/lazy-modals';

export const DEFERRED_FEATURE_PRELOADS = [NewChatModal.preload, ...CHAT_PANEL_PRELOADS, GifPanel.preload, EditProfileModal.preload, PhotoCropModal.preload];
