export { useRoomPhoto, useUserPhoto } from './hooks/usePhotos';
export { PendingPhotoFailedToast } from './components/PendingPhotoFailedToast';
export { queuePendingMyPhoto, removeMyPhoto, removeRoomPhoto, uploadMyPhoto, uploadRoomPhoto } from './lib/photo-actions';
export {
  clearNotificationIcons,
  NOTIFICATION_ICON_CACHE_NAME,
  NOTIFICATION_ICON_SIZE,
  notificationIconUrl,
} from './lib/notification-icon-cache';
export { startNotificationIconSync } from './lib/notification-icon-sync';
export { renderCircularPhotoDataUrl } from './lib/photo-icon';
export { AVATAR_UPLOAD_ENDPOINT, MAX_AVATAR_UPLOAD_BYTES } from './api/avatar-api';
export { canChangeRoomPhoto, getRoomPhotoUrl, getUserPhotoUrl } from '@lib/e2ee';
